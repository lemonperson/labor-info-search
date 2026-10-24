import type { z } from 'zod'
import type {
  appInfoSchema, claimStatusSchema, companySubjectSchema, connectorRunSchema,
  entityCandidateSchema, eventGroupSchema, searchQuerySchema, searchSessionSchema,
  sourceRecordSchema, sourceRegistryEntrySchema, sourceRegistrySchema, sourceTypeSchema,
  subjectRoleSchema, subjectVerificationSchema
} from './schemas'

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
}
