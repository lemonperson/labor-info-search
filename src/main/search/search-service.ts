import { companySubjectSchema, searchQuerySchema } from '../../shared/schemas'
import type { CompanySubject, ConnectorRun, SearchBatch, SearchProgress, SearchQuery, SearchQueryRun } from '../../shared/types'
import type { ConnectorResult, SearchConnector } from './types'
import { SharedRateLimiter, type RateLimitClock } from './rate-limiter'
const failure = (code: 'cancelled' | 'timeout' | 'connector_error'): ConnectorResult => ({ ok: false, error: { code } })

export class SearchService {
  private readonly queryTimeoutMs: number
  private readonly connectors: readonly SearchConnector[]
  private readonly limiters: Map<string, SharedRateLimiter>
  constructor(connectors: readonly SearchConnector[], options: { queryTimeoutMs?: number; connectorPolicies?: Record<string, { enabled: boolean; requestsPerMinute: number }>; clock?: RateLimitClock } = {}) {
    this.queryTimeoutMs = options.queryTimeoutMs ?? 10_000
    if (!Number.isSafeInteger(this.queryTimeoutMs) || this.queryTimeoutMs < 1 || this.queryTimeoutMs > 10_000)
      throw new RangeError('Query timeout must be between 1 and 10000 milliseconds')
    if (new Set(connectors.map(({ id }) => id)).size !== connectors.length)
      throw new TypeError('Connector IDs must be unique')
    this.connectors = connectors.filter(({ id }) => options.connectorPolicies?.[id]?.enabled !== false)
    this.limiters = new Map(this.connectors.map(({ id }) => [id, new SharedRateLimiter(options.connectorPolicies?.[id]?.requestsPerMinute ?? 12, options.clock)]))
  }
  private async execute(connector: SearchConnector, query: SearchQuery, signal: AbortSignal): Promise<ConnectorResult> {
    if (signal.aborted) return failure('cancelled')
    if (!await this.limiters.get(connector.id)!.acquire(signal)) return failure('cancelled')
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort!: () => void
    const stopped = new Promise<ConnectorResult>((resolve) => {
      // Resolve first so cancellation/deadline wins over connector teardown errors.
      abort = () => { resolve(failure('cancelled')); controller.abort() }
      signal.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => { resolve(failure('timeout')); controller.abort() }, this.queryTimeoutMs)
    })
    try {
      return await Promise.race([
        stopped,
        Promise.resolve().then(() => {
          if (controller.signal.aborted) return failure(signal.aborted ? 'cancelled' : 'timeout')
          return connector.search(query, controller.signal)
        }).catch(() => failure('connector_error'))
      ])
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
    }
  }
  async run(subject: CompanySubject, queries: SearchQuery[], onProgress: (event: SearchProgress) => void, signal: AbortSignal): Promise<SearchBatch> {
    const selected = companySubjectSchema.parse(subject)
    const validated = queries.map((query) => searchQuerySchema.parse(query))
    if (validated.some((query) => query.subjectId !== selected.id)) throw new TypeError('Query subject mismatch')
    const jobs = this.connectors.flatMap((connector) => validated.map((query) => ({ connector, query })))
    const results: ConnectorResult[] = new Array(jobs.length)
    let cursor = 0, completed = 0
    const emit = (event: SearchProgress) => {
      try { onProgress(event) } catch { /* Disposed observers must not erase results or prevent cleanup. */ }
    }
    emit({ phase: 'searching', completed, total: jobs.length })
    const worker = async () => {
      while (cursor < jobs.length) {
        const index = cursor++
        const { connector, query } = jobs[index]
        results[index] = await this.execute(connector, query, signal)
        completed++
        emit({ phase: 'searching', completed, total: jobs.length, connectorId: connector.id, queryId: query.id })
      }
    }
    await Promise.all([worker(), worker()])
    const queryRuns: SearchQueryRun[] = jobs.map(({ connector, query }, index) => {
      const result = results[index]
      return { connectorId: connector.id, queryId: query.id,
        status: result.ok ? 'completed' : result.error.code === 'cancelled' ? 'cancelled' : 'failed',
        ...(!result.ok ? { errorCode: result.error.code } : {}) }
    })
    const connectorRuns: ConnectorRun[] = this.connectors.map(({ id }) => {
      const runs = queryRuns.filter((run) => run.connectorId === id)
      const successes = runs.filter((run) => run.status === 'completed').length
      const errors = [...new Set(runs.flatMap((run) => run.errorCode ? [run.errorCode] : []))]
      return { connectorId: id,
        status: runs.some((run) => run.status === 'cancelled') ? 'cancelled'
          : successes === runs.length ? 'completed' : successes ? 'partial' : 'failed',
        ...(errors.length ? { message: errors.join(', ') } : {}) }
    })
    const successes = results.filter((result) => result.ok).length
    const status: SearchBatch['status'] = signal.aborted ? 'cancelled'
      : validated.length === 0 ? 'completed' : !jobs.length ? 'failed'
        : successes === jobs.length ? 'completed' : successes ? 'partial' : 'failed'
    const batch: SearchBatch = {
      subject: selected, queries: validated,
      records: results.flatMap((result, index) => result.ok ? result.records.map((record) => ({ ...record, queryIds: [...new Set([...(record.queryIds ?? []), jobs[index].query.id])], connectorIds: [...new Set([...(record.connectorIds ?? []), jobs[index].connector.id])] })) : []),
      status, coverage: 'best-effort', connectorRuns, queryRuns
    }
    emit({ phase: 'complete', completed, total: jobs.length, status })
    return batch
  }
}
