import { describe, expect, it } from 'vitest'
import {
  claimStatusSchema, companySubjectSchema, entityCandidateSchema, eventGroupSchema,
  searchQuerySchema, searchSessionSchema, sourceRecordSchema, sourceRegistrySchema,
  sourceTypeSchema, subjectRoleSchema
} from '../../../src/shared/schemas'
import type {
  ClaimStatus, CompanySubject, EntityCandidate, EventGroup, SearchQuery, SearchSession,
  SourceRecord, SourceType, SubjectRole
} from '../../../src/shared/types'

const subject: CompanySubject = {
  id: 'subject-1', name: '示例制造有限公司', role: 'manufacturer',
  verification: 'user-confirmed', evidence: ['包装标注生产企业：示例制造有限公司']
}
const candidate: EntityCandidate = {
  id: 'candidate-1', name: '示例品牌', role: 'brand', evidence: ['商品页面品牌字段']
}
const query: SearchQuery = {
  id: 'query-1', subjectId: 'subject-1', terms: ['示例制造有限公司', '欠薪'], topic: '欠薪/工资拖欠'
}
const record: SourceRecord = {
  id: 'record-1', subjectId: 'subject-1', title: '公开劳动争议信息',
  sourceType: 'employee-statement', publisher: '公开讨论平台', url: 'https://example.com/post/1',
  accessedAt: '2026-10-24T07:00:00Z', excerpt: '据发帖人陈述，相关事项尚待核验。',
  claimStatus: 'unverified', matchEvidence: ['正文出现完整企业名称'], availability: 'available'
}
const group: EventGroup = {
  id: 'event-1', subjectId: 'subject-1', title: '劳动争议及后续', recordIds: ['record-1', 'record-2'], status: 'suggested', matchEvidence: ['标题和主体线索重合']
}
const session: SearchSession = {
  id: 'session-1', inputType: 'company-name', subject, queries: [query], records: [record],
  eventGroups: [group], startedAt: '2026-10-24T07:00:00Z', status: 'partial',
  connectorRuns: [{ connectorId: 'public-source', status: 'failed', message: '连接超时' }]
}

// Catches corrupted or overpermissive data crossing persistence and network boundaries.
describe('domain schemas', () => {
  it('accepts each persisted domain object without losing evidence or state', () => {
    expect(companySubjectSchema.parse(subject)).toEqual(subject)
    expect(entityCandidateSchema.parse(candidate)).toEqual(candidate)
    expect(sourceRecordSchema.parse(record)).toEqual(record)
    expect(eventGroupSchema.parse(group)).toEqual(group)
    expect(searchSessionSchema.parse(session)).toEqual(session)
    expect(searchQuerySchema.parse(query)).toEqual(query)
  })

  it.each(['', ' ', '\t\n'])('rejects blank subject and candidate names: %j', (name) => {
    expect(companySubjectSchema.safeParse({ ...subject, name }).success).toBe(false)
    expect(entityCandidateSchema.safeParse({ ...candidate, name }).success).toBe(false)
  })

  it.each(['verified', 'user-confirmed', 'unverified'] as const)('preserves verification state %s', (verification) => {
    expect(companySubjectSchema.parse({ ...subject, verification }).verification).toBe(verification)
  })

  it('rejects invented verification states', () => {
    expect(companySubjectSchema.safeParse({ ...subject, verification: 'probably-verified' }).success).toBe(false)
  })

  it.each([
    'brand', 'brand-owner', 'store-operator', 'parent-company', 'subsidiary', 'affiliate',
    'commissioning-party', 'manufacturer', 'contract-manufacturer', 'distributor', 'platform-operator', 'unknown'
  ] satisfies SubjectRole[])('preserves distinct subject role %s', (role) => {
    expect(subjectRoleSchema.parse(role)).toBe(role)
    expect(companySubjectSchema.parse({ ...subject, role }).role).toBe(role)
    expect(entityCandidateSchema.parse({ ...candidate, role }).role).toBe(role)
  })

  it.each([
    'government', 'court-arbitration', 'media', 'company-response', 'employee-statement', 'other'
  ] satisfies SourceType[])('preserves source classification %s', (sourceType) => {
    expect(sourceTypeSchema.parse(sourceType)).toBe(sourceType)
    expect(sourceRecordSchema.parse({ ...record, sourceType }).sourceType).toBe(sourceType)
  })

  it.each(['unverified', 'independently-confirmed', 'disputed'] satisfies ClaimStatus[])(
    'preserves explicit claim status for non-personal sources: %s', (claimStatus) => {
      expect(claimStatusSchema.parse(claimStatus)).toBe(claimStatus)
      expect(sourceRecordSchema.parse({ ...record, sourceType: 'media', claimStatus }).claimStatus).toBe(claimStatus)
    }
  )

  it.each(['independently-confirmed', 'disputed'] as const)(
    'rejects personal statements with claim status %s at the record boundary', (claimStatus) => {
      expect(sourceRecordSchema.safeParse({ ...record, claimStatus }).success).toBe(false)
    }
  )

  it.each(['independently-confirmed', 'disputed'] as const)(
    'rejects personal statements with claim status %s inside sessions', (claimStatus) => {
      expect(searchSessionSchema.safeParse({ ...session, records: [{ ...record, claimStatus }] }).success).toBe(false)
    }
  )

  it('keeps independent confirmation in a separate source without upgrading the personal statement', () => {
    const confirmation: SourceRecord = {
      ...record, id: 'record-2', sourceType: 'media', publisher: '示例新闻媒体',
      url: 'https://example.com/news/2', excerpt: '报道载明已独立核实的事项。',
      claimStatus: 'independently-confirmed', relatedRecordIds: ['record-1']
    }
    const parsed = searchSessionSchema.parse({ ...session, records: [record, confirmation] })
    expect(parsed.records[0].claimStatus).toBe('unverified')
    expect(parsed.records[1].claimStatus).toBe('independently-confirmed')
    expect(parsed.records[1].id).toBe('record-2')
    expect(parsed.records[1].relatedRecordIds).toEqual(['record-1'])
    expect(record.claimStatus).toBe('unverified')
  })
  it('rejects unknown classifications', () => {
    expect(sourceTypeSchema.safeParse('official-looking').success).toBe(false)
    expect(subjectRoleSchema.safeParse('same-as-brand').success).toBe(false)
    expect(claimStatusSchema.safeParse('guilty').success).toBe(false)
    expect(sourceRecordSchema.safeParse({ ...record, sourceType: 'official-looking' }).success).toBe(false)
  })

  it.each(['invalid', '/relative', 'javascript:alert(1)', 'file:///private/file', 'ftp://example.com/file'])(
    'rejects non-web or malformed source URLs: %s', (url) => {
      expect(sourceRecordSchema.safeParse({ ...record, url }).success).toBe(false)
    }
  )

  it('accepts short excerpts at the limit and rejects long cached text', () => {
    expect(sourceRecordSchema.safeParse({ ...record, excerpt: '文'.repeat(1200) }).success).toBe(true)
    expect(sourceRecordSchema.safeParse({ ...record, excerpt: '文'.repeat(1201) }).success).toBe(false)
  })

  it.each(['publisher', 'accessedAt'] as const)('requires source %s', (field) => {
    const payload: Record<string, unknown> = { ...record }
    delete payload[field]
    expect(sourceRecordSchema.safeParse(payload).success).toBe(false)
    expect(sourceRecordSchema.safeParse({ ...record, [field]: ' ' }).success).toBe(false)
  })

  it('rejects invalid timestamps without inventing publication dates', () => {
    expect(sourceRecordSchema.safeParse({ ...record, accessedAt: 'yesterday' }).success).toBe(false)
    expect(sourceRecordSchema.safeParse({ ...record, publishedAt: '2026-99-99' }).success).toBe(false)
    expect(sourceRecordSchema.parse(record)).not.toHaveProperty('publishedAt')
    expect(sourceRecordSchema.safeParse({ ...record, publishedAt: '2026-10-23' }).success).toBe(true)
  })

  it('preserves response links, publication time and unavailable source status', () => {
    const response = { ...record, publishedAt: '2026-10-23T09:00:00+08:00',
      availability: 'unavailable', relatedRecordIds: ['record-2'] }
    expect(sourceRecordSchema.parse(response)).toEqual(response)
  })

  it('rejects malformed nested records and unsupported session states', () => {
    expect(searchSessionSchema.safeParse({ ...session, records: [{ ...record, publisher: '' }] }).success).toBe(false)
    expect(searchSessionSchema.safeParse({ ...session, status: 'approved' }).success).toBe(false)
    expect(searchSessionSchema.safeParse({ ...session, connectorRuns: [{ connectorId: '', status: 'done' }] }).success).toBe(false)
    expect(eventGroupSchema.safeParse({ ...group, recordIds: [''] }).success).toBe(false)
  })

  it('rejects unrecognized fields including subjective severity scores', () => {
    for (const [schema, payload] of [
      [companySubjectSchema, subject], [entityCandidateSchema, candidate], [sourceRecordSchema, record],
      [eventGroupSchema, group], [searchSessionSchema, session], [searchQuerySchema, query]
    ] as const) {
      expect(schema.safeParse({ ...payload, severityScore: 10 }).success).toBe(false)
    }
  })

  it('validates queries and optional site scopes', () => {
    expect(searchQuerySchema.parse({ ...query, siteScope: 'gov.cn' }).siteScope).toBe('gov.cn')
    for (const changes of [{ terms: [] }, { terms: [' '] }, { subjectId: '' }, { topic: ' ' },
      { siteScope: 'https://gov.cn/' }, { siteScope: 'gov.cn/path' }, { siteScope: ' ' }]) {
      expect(searchQuerySchema.safeParse({ ...query, ...changes }).success).toBe(false)
    }
  })

  it('validates a registry with explicit access policies', async () => {
    const { default: registry } = await import('../../../resources/sources/source-registry.json')
    expect(sourceRegistrySchema.safeParse(registry).success).toBe(true)
    const entry = { id: 'example', name: '示例公开来源', sourceType: 'government',
      homepageUrl: 'https://example.com/', enabled: false, requestsPerMinute: 6, cacheTtlSeconds: 3600 }
    expect(sourceRegistrySchema.parse({ version: 1, sources: [entry] })).toEqual({ version: 1, sources: [entry] })
    for (const changes of [{ sourceType: 'rumor' }, { homepageUrl: 'bad' }, { requestsPerMinute: 0 },
      { cacheTtlSeconds: -1 }, { enabled: 'yes' }]) {
      expect(sourceRegistrySchema.safeParse({ version: 1, sources: [{ ...entry, ...changes }] }).success).toBe(false)
    }
    expect(sourceRegistrySchema.safeParse({ version: 1, sources: [entry, entry] }).success).toBe(false)
  })
})
