import { z } from 'zod'

export const appInfoSchema = z.object({
  name: z.literal('劳动信息检索'),
  version: z.string().min(1),
  platform: z.literal('win32')
}).strict()

export const appInfoRequestSchema = z.object({}).strict()

const nonBlankText = z.string().refine((value) => value.trim().length > 0, 'Must not be blank')
const timestamp = z.iso.datetime({ offset: true })
const webUrl = z.url({ protocol: /^https?$/ })
const siteScope = z.string().regex(
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
  'Expected a hostname without scheme or path'
)

export const subjectRoleSchema = z.enum([
  'brand', 'brand-owner', 'store-operator', 'parent-company', 'subsidiary', 'affiliate',
  'commissioning-party', 'manufacturer', 'contract-manufacturer', 'distributor', 'platform-operator', 'unknown'
])

export const subjectVerificationSchema = z.enum(['verified', 'user-confirmed', 'unverified'])

export const entityCandidateSchema = z.object({
  id: nonBlankText,
  name: nonBlankText,
  role: subjectRoleSchema,
  evidence: z.array(nonBlankText)
}).strict()

export const companySubjectSchema = entityCandidateSchema.extend({
  verification: subjectVerificationSchema,
  aliases: z.array(nonBlankText).optional()
}).strict()

export const sourceTypeSchema = z.enum([
  'government', 'court-arbitration', 'media', 'company-response', 'employee-statement', 'other'
])

// Verification is explicit; a source classification never confirms an allegation.
export const claimStatusSchema = z.enum(['unverified', 'independently-confirmed', 'disputed'])

export const sourceRecordSchema = z.object({
  id: nonBlankText,
  subjectId: nonBlankText,
  title: nonBlankText,
  sourceType: sourceTypeSchema,
  publisher: nonBlankText,
  url: webUrl,
  publishedAt: z.union([timestamp, z.iso.date()]).optional(),
  accessedAt: timestamp,
  excerpt: z.string().max(1200),
  claimStatus: claimStatusSchema,
  matchEvidence: z.array(nonBlankText).min(1),
  availability: z.enum(['available', 'unavailable', 'unknown']),
  relatedRecordIds: z.array(nonBlankText).optional()
}).strict().refine(
  // Independent confirmation belongs to its own source, never to the personal statement.
  ({ sourceType, claimStatus }) => sourceType !== 'employee-statement' || claimStatus === 'unverified',
  { message: 'Personal statements must remain unverified', path: ['claimStatus'] }
)

export const eventGroupSchema = z.object({
  id: nonBlankText,
  subjectId: nonBlankText,
  title: nonBlankText,
  recordIds: z.array(nonBlankText).min(1)
}).strict()

export const searchQuerySchema = z.object({
  id: nonBlankText,
  subjectId: nonBlankText,
  terms: z.array(nonBlankText).min(1),
  topic: nonBlankText,
  siteScope: siteScope.optional()
}).strict()

export const connectorRunSchema = z.object({
  connectorId: nonBlankText,
  status: z.enum(['pending', 'running', 'completed', 'partial', 'failed', 'cancelled', 'disabled']),
  message: nonBlankText.optional()
}).strict()

export const searchSessionSchema = z.object({
  id: nonBlankText,
  inputType: z.enum(['company-name', 'product-link', 'screenshot']),
  subject: companySubjectSchema,
  queries: z.array(searchQuerySchema),
  records: z.array(sourceRecordSchema),
  eventGroups: z.array(eventGroupSchema),
  startedAt: timestamp,
  completedAt: timestamp.optional(),
  status: z.enum(['pending', 'running', 'completed', 'partial', 'cancelled', 'failed']),
  connectorRuns: z.array(connectorRunSchema)
}).strict()

export const sourceRegistryEntrySchema = z.object({
  id: nonBlankText,
  name: nonBlankText,
  sourceType: sourceTypeSchema,
  homepageUrl: webUrl,
  enabled: z.boolean(),
  requestsPerMinute: z.number().int().positive(),
  cacheTtlSeconds: z.number().int().nonnegative()
}).strict()

export const sourceRegistrySchema = z.object({
  version: z.literal(1),
  sources: z.array(sourceRegistryEntrySchema)
}).strict().refine(
  ({ sources }) => new Set(sources.map(({ id }) => id)).size === sources.length,
  { message: 'Source IDs must be unique', path: ['sources'] }
)

export const appSettingsSchema = z.object({
  saveHistory: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  browserProvider: z.enum(['bing', 'baidu', 'google'])
}).strict()

export const settingsPatchSchema = appSettingsSchema.partial().strict()
export const historyListRequestSchema = z.object({ limit: z.number().int().min(1).max(100) }).strict()
export const historyIdRequestSchema = z.object({ id: nonBlankText }).strict()
export const historyListResponseSchema = z.array(searchSessionSchema).max(100)
export const historyGetResponseSchema = searchSessionSchema.nullable()
export const storageEmptyRequestSchema = z.object({}).strict()
export const storageMutationResponseSchema = z.null()

export const ocrErrorSchema = z.enum([
  'picker-cancelled', 'cancelled', 'invalid-image', 'image-too-large', 'unreadable-image', 'ocr-failed'
])

const ocrConfidence = z.number().min(0).max(100)
export const ocrTextLineSchema = z.object({ text: z.string().max(2000), confidence: ocrConfidence }).strict()
export const ocrTextWordSchema = z.object({ text: z.string().max(500), confidence: ocrConfidence }).strict()
export const ocrProgressSchema = z.object({ status: z.string().min(1).max(80), progress: z.number().min(0).max(1) }).strict()
export const ocrCandidateResultSchema = z.object({
  rawText: z.string().max(50000),
  confidence: ocrConfidence,
  lines: z.array(ocrTextLineSchema).max(1000),
  words: z.array(ocrTextWordSchema).max(10000),
  candidates: z.array(entityCandidateSchema).max(100),
  needsReview: z.boolean()
}).strict()
export const ocrResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: ocrCandidateResultSchema }).strict(),
  z.object({ ok: z.literal(false), error: ocrErrorSchema }).strict()
])
export const ocrRequestSchema = z.object({}).strict()
