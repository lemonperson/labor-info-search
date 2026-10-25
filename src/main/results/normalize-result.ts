import registryJson from '../../../resources/sources/source-registry.json'
import { sourceRecordSchema, sourceRegistrySchema, companySubjectSchema } from '../../shared/schemas'
import type { CompanySubject, SourceRecord, SourceRegistry } from '../../shared/types'
import { classifySource } from './classify-source'
import { toSafeDisplayText } from '../security/text-safety'

const defaultRegistry: SourceRegistry = sourceRegistrySchema.parse(registryJson)

/** Turn a connector record into a validated, bounded display record with explicit source metadata. */
export function normalizeRawResult(raw: SourceRecord, subject: CompanySubject, registry: SourceRegistry = defaultRegistry): SourceRecord {
  // Bound hostile connector text before the strict persisted-record schema sees it.
  const candidate = sourceRecordSchema.parse({
    ...raw,
    ...(raw.sourceType === 'employee-statement' ? { claimStatus: 'unverified' } : {}),
    title: toSafeDisplayText(raw.title, 500),
    excerpt: toSafeDisplayText(raw.excerpt, 1200),
    matchEvidence: raw.matchEvidence.slice(0, 20).map((evidence) => toSafeDisplayText(evidence, 500))
  })
  const selectedSubject = companySubjectSchema.parse(subject)
  if (candidate.subjectId !== selectedSubject.id) throw new TypeError('Result subject mismatch')
  const url = new URL(candidate.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Result URL must be an HTTP(S) URL without credentials')
  const title = candidate.title
  if (!title) throw new TypeError('Result title must contain display text')
  const classification = classifySource(url.href, candidate.publisher, registry)
  const excerpt = candidate.excerpt
  const publisher = toSafeDisplayText(candidate.publisher, 200) || url.hostname
  return sourceRecordSchema.parse({
    ...candidate,
    subjectId: selectedSubject.id,
    title,
    publisher,
    url: url.href,
    sourceType: candidate.sourceType !== 'other' ? candidate.sourceType : classification.sourceType,
    // Retrieval metadata does not prove a claim or imply a company's position.
    claimStatus: 'unverified',
    excerpt,
    queryIds: [...new Set(candidate.queryIds ?? [])].sort(),
    connectorIds: [...new Set(candidate.connectorIds ?? [])].sort(),
    ...(candidate.canonicalUrl ? { canonicalUrl: canonicalizeUrl(candidate.canonicalUrl) } : {})
  })
}

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl)
  url.hash = ''
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_.+|gclid|fbclid|msclkid|yclid|mc_cid|mc_eid|spm|from)$/i.test(key)) url.searchParams.delete(key)
  }
  url.searchParams.sort()
  url.hostname = url.hostname.toLowerCase()
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = ''
  return url.href
}
