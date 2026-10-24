import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchService } from '../../../src/main/search/search-service'
import type { SearchConnector } from '../../../src/main/search/types'
import type { SearchProgress, SearchQuery } from '../../../src/shared/types'
import { session } from '../database/fixtures'

const subject = session().subject
const queries: SearchQuery[] = Array.from({ length: 4 }, (_, i) => ({
  id: `q${i}`, subjectId: subject.id, terms: [subject.name, '欠薪'], topic: '欠薪'
}))
const record = session().records[0]
const success: SearchConnector = { id: 'good', search: async () => ({ ok: true, records: [record] }) }
const failed: SearchConnector = { id: 'bad', search: async () => ({ ok: false, error: { code: 'blocked_or_changed' } }) }
afterEach(() => vi.useRealTimers())

describe('search orchestration', () => {
  it('retains results and failure reasons with partial status and observable progress', async () => {
    const events: SearchProgress[] = []
    const batch = await new SearchService([success, failed]).run(subject, queries.slice(0, 1), (event) => events.push(event), new AbortController().signal)
    expect(batch.status).toBe('partial')
    expect(batch.coverage).toBe('best-effort')
    expect(batch.records).toEqual([record])
    expect(batch.connectorRuns).toEqual([
      { connectorId: 'good', status: 'completed' },
      { connectorId: 'bad', status: 'failed', message: 'blocked_or_changed' }
    ])
    expect(batch.queryRuns).toEqual([
      { connectorId: 'good', queryId: 'q0', status: 'completed' },
      { connectorId: 'bad', queryId: 'q0', status: 'failed', errorCode: 'blocked_or_changed' }
    ])
    expect(events[0]).toMatchObject({ phase: 'searching', completed: 0, total: 2 })
    expect(events.at(-1)).toMatchObject({ phase: 'complete', completed: 2, total: 2, status: 'partial' })
  })
  it('returns failed with diagnostics when every connector fails, including exceptions', async () => {
    const throwing: SearchConnector = { id: 'throwing', search: async () => { throw new Error('private detail') } }
    const batch = await new SearchService([failed, throwing]).run(subject, queries.slice(0, 1), () => {}, new AbortController().signal)
    expect(batch.status).toBe('failed')
    expect(batch.records).toEqual([])
    expect(batch.queryRuns.map((run) => run.errorCode)).toEqual(['blocked_or_changed', 'connector_error'])
  })
  it('enforces concurrency two across the full connector/query matrix', async () => {
    let active = 0, peak = 0, calls = 0
    const releases: (() => void)[] = []
    const connector: SearchConnector = { id: 'bounded', search: async () => {
      calls++; active++; peak = Math.max(peak, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active--
      return { ok: true, records: [] }
    } }
    const running = new SearchService([connector, { ...connector, id: 'second' }])
      .run(subject, queries, () => {}, new AbortController().signal)
    await vi.waitFor(() => expect(calls).toBe(2))
    expect(peak).toBe(2)
    for (let round = 0; round < 4; round++) {
      releases.splice(0).forEach((release) => release())
      if (round < 3) await vi.waitFor(() => expect(calls).toBe((round + 2) * 2))
    }
    expect((await running).status).toBe('completed')
    expect(peak).toBe(2)
  })
  it('times out uncooperative queries, aborts their signals, and continues queued work', async () => {
    vi.useFakeTimers()
    const signals: AbortSignal[] = []
    const hanging: SearchConnector = { id: 'hung', search: async (_query, signal) => { signals.push(signal); return new Promise(() => {}) } }
    const running = new SearchService([hanging], { queryTimeoutMs: 20 }).run(subject, queries, () => {}, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(50)
    const batch = await running
    expect(batch.status).toBe('failed')
    expect(batch.queryRuns.map((run) => run.errorCode)).toEqual(['timeout', 'timeout', 'timeout', 'timeout'])
    expect(signals).toHaveLength(4)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels in-flight work, does not schedule queued work, and retains completed results', async () => {
    const controller = new AbortController()
    let calls = 0
    const signals: AbortSignal[] = []
    const mixed: SearchConnector = { id: 'mixed', search: async (query, signal) => {
      calls++; signals.push(signal)
      return query.id === 'q0' ? { ok: true, records: [record] } : new Promise(() => {})
    } }
    const running = new SearchService([mixed]).run(subject, queries, () => {}, controller.signal)
    await vi.waitFor(() => expect(calls).toBe(3))
    controller.abort()
    const batch = await running
    expect(batch.status).toBe('cancelled')
    expect(batch.records).toEqual([record])
    expect(batch.queryRuns.map((run) => run.status)).toEqual(['completed', 'cancelled', 'cancelled', 'cancelled'])
    expect(signals.slice(1).every((signal) => signal.aborted)).toBe(true)
    expect(calls).toBe(3)
  })
  it('handles cancellation before start without connector calls', async () => {
    let calls = 0
    const connector: SearchConnector = { id: 'never', search: async () => { calls++; return { ok: true, records: [] } } }
    const batch = await new SearchService([connector]).run(subject, queries, () => {}, AbortSignal.abort())
    expect(batch.status).toBe('cancelled')
    expect(calls).toBe(0)
    expect(batch.queryRuns.every((run) => run.status === 'cancelled')).toBe(true)
  })
  it('reports successful empty results and mixed query outcomes distinctly', async () => {
    const mixed: SearchConnector = { id: 'mixed', search: async (query) => query.id === 'q0'
      ? { ok: true, records: [] } : { ok: false, error: { code: 'network_error' } } }
    const batch = await new SearchService([mixed]).run(subject, queries, () => {}, new AbortController().signal)
    expect(batch.status).toBe('partial')
    expect(batch.records).toEqual([])
    expect(batch.connectorRuns).toEqual([{ connectorId: 'mixed', status: 'partial', message: 'network_error' }])
    expect((await new SearchService([success]).run(subject, [], () => {}, new AbortController().signal)).status).toBe('completed')
    expect((await new SearchService([]).run(subject, queries, () => {}, new AbortController().signal)).status).toBe('failed')
  })
  it('rejects mismatched subjects before network work', async () => {
    await expect(new SearchService([success]).run(subject, [{ ...queries[0], subjectId: 'other' }], () => {}, new AbortController().signal)).rejects.toThrow()
  })
})
