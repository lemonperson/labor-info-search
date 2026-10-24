import type { ConnectorFailureCode, SearchQuery, SourceRecord } from '../../shared/types'
export type ConnectorResult =
  | { ok: true; records: SourceRecord[] }
  | { ok: false; error: { code: ConnectorFailureCode } }
export interface SearchConnector {
  readonly id: string
  search(query: SearchQuery, signal: AbortSignal): Promise<ConnectorResult>
}
