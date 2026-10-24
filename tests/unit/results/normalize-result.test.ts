import { describe, expect, it } from 'vitest'
import { normalizeRawResult } from '../../../src/main/results/normalize-result'
import type { CompanySubject, SourceRecord } from '../../../src/shared/types'

const subject: CompanySubject = { id: 'subject-1', name: '示例公司', role: 'brand-owner', evidence: ['工商信息'], verification: 'user-confirmed' }
const raw: SourceRecord = {
  id: 'raw-1', subjectId: 'subject-1', title: '员工称欠薪', sourceType: 'other', publisher: 'weibo.com', url: 'https://weibo.com/post/1',
  publishedAt: '2026-10-01T00:00:00.000Z', accessedAt: '2026-10-02T00:00:00.000Z', excerpt: '员工表示未收到工资。', claimStatus: 'unverified',
  matchEvidence: ['query=q1; connector=social-search'], availability: 'unknown', queryIds: ['q1'], connectorIds: ['social-search']
}

describe('normalizeRawResult', () => {
  it('uses safe text, neutral source metadata, and preserves supplied dates and attribution', () => {
    const result = normalizeRawResult({ ...raw, title: '<b>回应</b>：<script>alert(1)</script>营运正常', excerpt: '<img src=x>员工表示未收到工资。' }, subject)
    expect(result).toMatchObject({ title: '回应 ： 营运正常', excerpt: '员工表示未收到工资。', sourceType: 'other', claimStatus: 'unverified', subjectId: 'subject-1', publishedAt: raw.publishedAt, queryIds: ['q1'], connectorIds: ['social-search'] })
  })
  it('handles missing publication dates without inventing one and bounds excerpt to 1,200 characters', () => {
    const result = normalizeRawResult({ ...raw, publishedAt: undefined, excerpt: 'x'.repeat(1400) }, subject)
    expect(result.publishedAt).toBeUndefined()
    expect(result.excerpt).toHaveLength(1200)
  })
  it('preserves registry classification and never promotes social claims', () => {
    expect(normalizeRawResult({ ...raw, publisher: 'weibo.com', title: '企业回应，发展良好' }, subject).sourceType).toBe('other')
  })
})
