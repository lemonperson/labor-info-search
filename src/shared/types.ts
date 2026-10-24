import type { z } from 'zod'
import type {
  appInfoSchema, appSettingsSchema, claimStatusSchema, companySubjectSchema, connectorRunSchema,
  entityCandidateSchema, eventGroupSchema, searchQuerySchema, searchSessionSchema,
  sourceRecordSchema, sourceRegistryEntrySchema, sourceRegistrySchema, sourceTypeSchema, confirmedSubjectInputSchema, searchProgressSchema,
  subjectRoleSchema, subjectVerificationSchema, ocrErrorSchema, ocrCandidateResultSchema, ocrProgressSchema, ocrTextLineSchema, ocrTextWordSchema,
  productResolutionSchema, marketplaceEvidenceSchema, marketplacePlatformSchema
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
export interface SourceClassification {
  sourceType: SourceType
  claimStatus: ClaimStatus
  registryId?: string
}
export interface DeduplicationResult {
  records: SourceRecord[]
  duplicates: Array<{ retainedId: string; mergedIds: string[] }>
}

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
  search: {
    start(input: ConfirmedSubjectInput, sessionId: string): Promise<SearchSession>
    cancel(sessionId: string): Promise<null>
    onProgress(sessionId: string, listener: (progress: SessionProgress) => void): () => void
  }
  image: {
    pickAndRecognize(): Promise<Result<OcrCandidateResult, OcrError>>
    cancel(): Promise<null>
    onProgress(listener: (progress: OcrProgress) => void): () => void
  }
  marketplace: {
    resolve(rawUrl: string): Promise<ProductResolution>
    cancel(): Promise<null>
  }
  browser: {
    preview(provider: 'bing', reason: string, queries: SearchQuery[]): Promise<BrowserFallbackPreview>
    openConfirmed(previewId: string): Promise<Result<void, BrowserOpenError>>
  }
}

export type OcrCandidateResult = z.infer<typeof ocrCandidateResultSchema>
export type OcrError = z.infer<typeof ocrErrorSchema>
export type OcrProgress = z.infer<typeof ocrProgressSchema>
export type OcrTextLine = z.infer<typeof ocrTextLineSchema>
export type OcrTextWord = z.infer<typeof ocrTextWordSchema>
export type ProductResolution = z.infer<typeof productResolutionSchema>
export type MarketplaceEvidence = z.infer<typeof marketplaceEvidenceSchema>
export type MarketplacePlatform = z.infer<typeof marketplacePlatformSchema>

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
  previewId: string
  provider: 'bing'
  hostname: 'www.bing.com'
  reason: string
  queries: string[]
  expiresAt: string
}
export type BrowserOpenError = 'preview-not-found' | 'preview-expired' | 'browser-open-failed'
export type ConfirmedSubjectInput = z.infer<typeof confirmedSubjectInputSchema>
export type SessionProgress = z.infer<typeof searchProgressSchema>
