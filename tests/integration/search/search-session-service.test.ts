import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseHandle } from '../../../src/main/database/database'
import { SearchRepository } from '../../../src/main/database/search-repository'
import { SettingsRepository } from '../../../src/main/database/settings-repository'
import { SearchSessionService } from '../../../src/main/search/search-session-service'
import { SearchService } from '../../../src/main/search/search-service'
import type { SearchConnector } from '../../../src/main/search/types'
import type { ConfirmedSubjectInput, SessionProgress } from '../../../src/shared/types'

const input: ConfirmedSubjectInput = {
  subject: { id: 'subject-1', name: '青禾食品有限公司', role: 'manufacturer', verification: 'user-confirmed', evidence: ['生产企业：青禾食品有限公司'] },
  selectedEvidence: ['生产企业：青禾食品有限公司'], verification: 'user-confirmed', origin: 'screenshot'
}
const record = (id: string, url: string, title: string, evidence: string[]) => ({
  id, subjectId: input.subject.id, title, sourceType: 'other' as const, publisher: 'news.example.com', url,
  accessedAt: '2026-10-24T07:00:00Z', publishedAt: '2026-10-20', excerpt: '来源公开信息，尚待人工核验。',
  claimStatus: 'unverified' as const, matchEvidence: evidence, availability: 'available' as const
})
let directory: string
let db: DatabaseHandle
let repository: SearchRepository
let settings: SettingsRepository
let id = 0
const timestamp = '2026-10-24T07:00:00Z'
function service(connectors: SearchConnector[]) {
  return new SearchSessionService(new SearchService(connectors, { queryTimeoutMs: 15 }), repository, {
    createId: () => `session-${++id}`, now: () => timestamp
  })
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'labor-session-'))
  db = openDatabase(join(directory, 'test.sqlite'))
  repository = new SearchRepository(db)
  settings = new SettingsRepository(db)
  id = 0
})
afterEach(() => { db?.close(); rmSync(directory, { recursive: true, force: true }) })

describe('end-to-end search sessions', () => {
  it('saves normalized, deduplicated, grouped search results and the confirmed evidence', async () => {
    const sharedTitle = '青禾食品有限公司劳动争议处理进展'
    const connectors: SearchConnector[] = [
      { id: 'news-a', search: async (query) => ({ ok: true, records: query.id.endsWith(':wages') ? [record('a', 'https://news.example.com/case?utm_source=x', sharedTitle, ['青禾食品有限公司欠薪劳动争议'])] : [] }) },
      { id: 'news-b', search: async (query) => ({ ok: true, records: query.id.endsWith(':wages') ? [record('b', 'https://news.example.com/case', sharedTitle, ['青禾食品有限公司欠薪劳动争议'])] : [] }) }
    ]
    const progress: SessionProgress[] = []
    const result = await service(connectors).start(input, event => progress.push(event))
    expect(result.status).toBe('completed')
    expect(result.inputType).toBe('screenshot')
    expect(result.subject.evidence).toContain('生产企业：青禾食品有限公司')
    expect(result.queries).toHaveLength(8)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ queryIds: expect.arrayContaining(['subject-1:wages']), connectorIds: ['news-a', 'news-b'], canonicalUrl: 'https://news.example.com/case' })
    expect(result.eventGroups).toHaveLength(0)
    expect(result.status).toBe('completed')
    expect(progress.map(({ phase }) => phase)).toEqual(expect.arrayContaining(['preparing_queries', 'searching', 'normalizing', 'saving', 'complete']))
    expect(repository.getSession(result.id)).toEqual(result)
  })

  it('reports a successful empty search as completed with no records', async () => {
    const result = await service([{ id: 'empty', search: async () => ({ ok: true, records: [] }) }]).start(input, () => {})
    expect(result.status).toBe('completed')
    expect(result.records).toEqual([])
    expect(result.connectorRuns).toEqual([{ connectorId: 'empty', status: 'completed' }])
  })

  it('retains records and human-readable connector failure when one connector times out', async () => {
    const connectors: SearchConnector[] = [
      { id: 'fast', search: async (query) => ({ ok: true, records: query.id.endsWith(':wages') ? [record('ok', 'https://source.example.com/case', '劳动争议处理进展', ['青禾食品有限公司劳动争议'])] : [] }) },
      { id: 'slow', search: async () => new Promise(() => {}) }
    ]
    const result = await service(connectors).start(input, () => {})
    expect(result.status).toBe('partial')
    expect(result.records).toHaveLength(1)
    expect(result.connectorRuns.find(run => run.connectorId === 'slow')).toMatchObject({ status: 'failed', message: expect.stringMatching(/超时|timeout/i) })
  })

  it('returns a failed session when all connectors are blocked', async () => {
    const blocked: SearchConnector = { id: 'blocked', search: async () => ({ ok: false, error: { code: 'blocked_or_changed' } }) }
    const result = await service([blocked]).start(input, () => {})
    expect(result.status).toBe('failed')
    expect(result.records).toEqual([])
    expect(result.connectorRuns[0]).toMatchObject({ status: 'failed', message: expect.stringMatching(/访问受阻|blocked/i) })
  })

  it('cancels only the selected session and persists completed partial records', async () => {
    let calls = 0
    const connector: SearchConnector = { id: 'mixed', search: async (query) => {
      calls++
      return query.id.endsWith(':wages') ? { ok: true, records: [record('partial', 'https://source.example.com/case', '欠薪劳动争议进展', ['青禾食品有限公司欠薪劳动争议'])] } : new Promise(() => {})
    } }
    const instance = service([connector])
    const progress: SessionProgress[] = []
    const running = instance.start(input, event => progress.push(event))
    await new Promise<void>(resolve => {
      const check = () => progress.some(event => event.phase === 'searching' && event.completed > 0) ? resolve() : setTimeout(check, 1)
      check()
    })
    const sessionId = progress[0].sessionId
    await instance.cancel(sessionId)
    const result = await running
    expect(result.status).toBe('cancelled')
    expect(result.records.map(value => value.id)).toEqual(['partial'])
    expect(repository.getSession(result.id)?.records).toHaveLength(1)
    expect(calls).toBeLessThan(8)
  })

  it('does not write history if saveHistory is disabled', async () => {
    settings.updateSettings({ saveHistory: false })
    const result = await service([{ id: 'empty', search: async () => ({ ok: true, records: [] }) }]).start(input, () => {})
    expect(result.status).toBe('completed')
    expect(repository.getSession(result.id)).toBeNull()
  })

  it('groups corroborating records as suggestions and keeps ambiguous evidence attached', async () => {
    const matching = (id: string, url: string) => record(id, url, '青禾食品有限公司劳动仲裁欠薪处理进展', ['青禾食品有限公司劳动仲裁欠薪'])
    const connector: SearchConnector = { id: 'public', search: async (query) => query.id.endsWith(':wages') ? { ok: true, records: [matching('one', 'https://one.example.com/report'), matching('two', 'https://two.example.com/report')] } : { ok: true, records: [] } }
    const ambiguous = { ...input, selectedEvidence: ['包装标注品牌青禾', '生产企业：青禾食品有限公司'] }
    const result = await service([connector]).start(ambiguous, () => {})
    expect(result.eventGroups).toHaveLength(1)
    expect(result.eventGroups[0].status).toBe('suggested')
    expect(result.subject.evidence).toEqual(expect.arrayContaining(ambiguous.selectedEvidence))
    expect(repository.getSession(result.id)?.subject.evidence).toEqual(expect.arrayContaining(ambiguous.selectedEvidence))
  })
})



describe('search IPC lifetime', () => {
  it('rejects malformed confirmed input before starting connector work', async () => {
    const { createSearchHandlers } = await import('../../../src/main/ipc/register-ipc')
    let calls = 0
    const connector: SearchConnector = { id: 'idle', search: async () => { calls++; return { ok: true, records: [] } } }
    const handlers = createSearchHandlers(service([connector]))
    await expect(handlers['search:start']({ subject: input.subject })).rejects.toThrow()
    expect(calls).toBe(0)
  })

  it('keeps concurrent starts isolated by unique session IDs', async () => {
    const { createSearchHandlers } = await import('../../../src/main/ipc/register-ipc')
    const connector: SearchConnector = { id: 'empty', search: async () => ({ ok: true, records: [] }) }
    const handlers = createSearchHandlers(service([connector]))
    const [left, right] = await Promise.all([handlers['search:start']({ confirmedSubject: input, sessionId: '8d4576e0-f8ad-44db-a42a-000000000001' }), handlers['search:start']({ confirmedSubject: input, sessionId: '8d4576e0-f8ad-44db-a42a-000000000002' })])
    expect((left as { id: string }).id).not.toBe((right as { id: string }).id)
  })

  it('rejects an untrusted sender and subframe before invoking a handler', async () => {
    const { createSenderCheckedHandler } = await import('../../../src/main/ipc/register-ipc')
    const mainFrame = {}
    const webContents = { mainFrame }
    const window = { webContents } as never
    let calls = 0
    const checked = createSenderCheckedHandler(() => window, () => { calls++; return null })
    expect(() => checked({ sender: {} as never, senderFrame: mainFrame } as never, {})).toThrow('Untrusted IPC sender')
    expect(() => checked({ sender: webContents as never, senderFrame: {} as never } as never, {})).toThrow('Untrusted IPC sender')
    expect(calls).toBe(0)
  })
})


describe('session phase ordering regression', () => {
  it('emits preparing, searching, normalizing, saving, then complete exactly once', async () => {
    const events: SessionProgress[] = []
    const result = await service([{ id: 'empty', search: async () => ({ ok: true, records: [] }) }]).start(input, event => events.push(event))
    const phaseTransitions = events.map(event => event.phase).filter((phase, index, all) => index === 0 || phase !== all[index - 1])
    expect(phaseTransitions).toEqual(['preparing_queries', 'searching', 'normalizing', 'saving', 'complete'])
    expect(events.filter(event => event.phase === 'complete')).toHaveLength(1)
    expect(repository.getSession(result.id)?.status).toBe('completed')
  })
})
