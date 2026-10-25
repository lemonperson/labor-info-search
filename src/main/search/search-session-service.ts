import { randomUUID } from 'node:crypto'
import { confirmedSubjectInputSchema, searchProgressSchema, searchSessionSchema } from '../../shared/schemas'
import type { ConfirmedSubjectInput, SearchProgress, SearchSession, SessionProgress } from '../../shared/types'
import { buildLaborQueries } from '../identity/query-builder'
import type { SearchRepository } from '../database/search-repository'
import { groupRelatedEvents } from '../results/group-events'
import { deduplicateRecords } from '../results/deduplicate'
import { normalizeRawResult } from '../results/normalize-result'
import { SearchService } from './search-service'

type ProgressUpdate = Omit<SessionProgress, 'sessionId'>

const readableFailures: Record<string, string> = {
  blocked_or_changed: '来源访问受阻或页面格式已变化', malformed_response: '来源返回的数据无法识别',
  network_error: '网络连接失败', timeout: '检索超时', cancelled: '已取消', connector_error: '来源检索发生错误'
}

export class SearchSessionService {
  private readonly controllers = new Map<string, AbortController>()
  private readonly recentSessions = new Map<string, SearchSession>()
  constructor(
    private readonly search: SearchService,
    private readonly repository: SearchRepository,
    private readonly options: { createId?: () => string; now?: () => string } = {}
  ) {}

  getSession(sessionId: string): SearchSession | null {
    return this.recentSessions.get(sessionId) ?? this.repository.getSession(sessionId)
  }

  async start(input: ConfirmedSubjectInput, progressPort: (progress: SessionProgress) => void, requestedSessionId?: string): Promise<SearchSession> {
    const confirmed = confirmedSubjectInputSchema.parse(input)
    const sessionId = requestedSessionId ?? this.options.createId?.() ?? randomUUID()
    if (this.controllers.has(sessionId) || this.recentSessions.has(sessionId) || this.repository.getSession(sessionId)) {
      throw new TypeError('Search session ID already exists')
    }
    const startedAt = this.options.now?.() ?? new Date().toISOString()
    const controller = new AbortController()
    this.controllers.set(sessionId, controller)
    const emit = (event: ProgressUpdate) => {
      try { progressPort(searchProgressSchema.parse({ sessionId, ...event })) } catch { /* Disposed renderer listeners cannot interrupt the search. */ }
    }
    try {
      const subject = {
        ...confirmed.subject,
        evidence: [...new Set([...confirmed.subject.evidence, ...confirmed.selectedEvidence])],
        verification: confirmed.verification
      }
      const queries = buildLaborQueries(subject)
      emit({ phase: 'preparing_queries', completed: queries.length, total: queries.length })
      const batch = await this.search.run(subject, queries, (event: SearchProgress) => { if (event.phase !== 'complete') emit(event) }, controller.signal)
      const normalized = batch.records.flatMap((record) => {
        try { return [normalizeRawResult(record, subject)] } catch { return [] }
      })
      const records = deduplicateRecords(normalized).records
      const eventGroups = groupRelatedEvents(records)
      emit({ phase: 'normalizing', completed: batch.records.length, total: batch.records.length })
      const connectorRuns = batch.connectorRuns.map((run) => ({
        ...run,
        ...(run.message ? { message: [...new Set(run.message.split(', '))].map(code => readableFailures[code] ?? code).join('；') } : {})
      }))
      const completedAt = this.options.now?.() ?? new Date().toISOString()
      const session = searchSessionSchema.parse({
        id: sessionId, inputType: confirmed.origin, subject, queries: batch.queries,
        records, eventGroups, startedAt, completedAt, status: batch.status, connectorRuns
      })
      emit({ phase: 'saving', completed: records.length, total: records.length, status: session.status })
      this.repository.saveSession(session)
      this.recentSessions.set(session.id, session)
      while (this.recentSessions.size > 100) this.recentSessions.delete(this.recentSessions.keys().next().value!)
      emit({ phase: 'complete', completed: records.length, total: records.length, status: session.status })
      return session
    } finally {
      if (this.controllers.get(sessionId) === controller) this.controllers.delete(sessionId)
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const controller = this.controllers.get(sessionId)
    controller?.abort()
  }
}
