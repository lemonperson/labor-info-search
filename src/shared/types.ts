import type { z } from 'zod'
import type {
  appInfoSchema, appSettingsSchema, claimStatusSchema, companySubjectSchema, connectorRunSchema,
  entityCandidateSchema, eventGroupSchema, searchQuerySchema, searchSessionSchema,
  sourceRecordSchema, sourceRegistryEntrySchema, sourceRegistrySchema, sourceTypeSchema,
  subjectRoleSchema, subjectVerificationSchema
} from './schemas'

export type AppSettings = z.infer<typeof appSettingsSchema>
export type AppInfo = z.infer<typeof appInfoSchema>
export type CompanySubject = z.infer<typeof companySubjectSchema>
export type EntityCandidate = z.infer<typeof entityCandidateSchema>
export type SubjectRole = z.infer<typeof subjectRoleSchema>
export type SubjectVerification = z.infer<typeof subjectVerificationSchema>
export type SourceType = z.infer<typeof sourceTypeSchema>
export type ClaimStatus = z.infer<typeof claimStatusSchema>
export type SourceRecord = z.infer<typeof sourceRecordSchema>
export type EventGroup = z.infer<typeof eventGroupSchema>
export type SearchSession = z.infer<typeof searchSessionSchema>
export type SearchQuery = z.infer<typeof searchQuerySchema>
export type ConnectorRun = z.infer<typeof connectorRunSchema>
export type SourceRegistryEntry = z.infer<typeof sourceRegistryEntrySchema>
export type SourceRegistry = z.infer<typeof sourceRegistrySchema>

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export interface LaborApi {
  getAppInfo(): Promise<AppInfo>
  history: {
    list(limit?: number): Promise<SearchSession[]>
    get(id: string): Promise<SearchSession | null>
    delete(id: string): Promise<null>
    clear(): Promise<null>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: Partial<AppSettings>): Promise<AppSettings>
  }
}

export type ConnectorFailureCode = 'blocked_or_changed' | 'malformed_response' | 'network_error' | 'timeout' | 'cancelled' | 'connector_error'
export interface SearchQueryRun {
  connectorId: string
  queryId: string
  status: 'completed' | 'failed' | 'cancelled'
  errorCode?: ConnectorFailureCode
}
export interface SearchBatch {
  subject: CompanySubject
  queries: SearchQuery[]
  records: SourceRecord[]
  status: 'completed' | 'partial' | 'failed' | 'cancelled'
  /** Completion describes scheduled work, never comprehensive search coverage. */
  coverage: 'best-effort'
  connectorRuns: ConnectorRun[]
  queryRuns: SearchQueryRun[]
}
export interface SearchProgress {
  phase: 'searching' | 'complete'
  completed: number
  total: number
  connectorId?: string
  queryId?: string
  status?: SearchBatch['status']
}
export interface BrowserFallbackPreview {
  provider: 'bing'
  hostname: 'www.bing.com'
  queries: string[]
  urls: string[]
}
