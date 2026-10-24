import type { SearchQuery, SourceRecord } from '../../shared/types'
import type { ConnectorResult, SearchConnector } from './types'

/** Deterministic connector enabled only by the explicit unpackaged E2E configuration. */
export class E2ESearchFixtureConnector implements SearchConnector {
  readonly id = 'e2e-fixture'
  async search(query: SearchQuery, signal: AbortSignal): Promise<ConnectorResult> {
    if (signal.aborted) return { ok: false, error: { code: 'cancelled' } }
    if (!query.id.endsWith(':wages')) return { ok: true, records: [] }
    const record: SourceRecord = {
      id: 'e2e-fixture-result', subjectId: query.subjectId, title: '劳动争议信息测试记录',
      sourceType: 'other', publisher: 'E2E 固定数据源', url: 'https://example.com/labor-search-fixture',
      accessedAt: '2026-10-24T00:00:00.000Z', publishedAt: '2026-10-23',
      excerpt: '用于自动化验证的固定检索结果。', claimStatus: 'unverified',
      matchEvidence: ['自动化测试固定检索线索'], availability: 'available',
      queryIds: [query.id], connectorIds: [this.id]
    }
    return { ok: true, records: [record] }
  }
}
