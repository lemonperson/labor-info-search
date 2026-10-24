import { describe, expect, it } from 'vitest'
import { buildLaborQueries } from '../../../src/main/identity/query-builder'
import { searchQuerySchema } from '../../../src/shared/schemas'
import type { CompanySubject } from '../../../src/shared/types'

const subject: CompanySubject = {
  id: 'subject-1', name: '示例制造有限公司', role: 'manufacturer',
  verification: 'user-confirmed', evidence: ['用户确认的包装标签']
}

// Catches missing themes, accidental moral labels, and unstable persisted query identities.
describe('buildLaborQueries', () => {
  it('covers all eight neutral topic groups with the exact selected subject', () => {
    const queries = buildLaborQueries(subject)
    expect(queries.map(({ topic, terms }) => ({ topic, terms }))).toEqual([
      { topic: '欠薪/工资拖欠', terms: ['示例制造有限公司', '欠薪', '工资拖欠'] },
      { topic: '劳动仲裁/劳动争议', terms: ['示例制造有限公司', '劳动仲裁', '劳动争议'] },
      { topic: '违法解除/裁员', terms: ['示例制造有限公司', '违法解除', '裁员'] },
      { topic: '加班/工时', terms: ['示例制造有限公司', '加班', '工时'] },
      { topic: '社保/工伤', terms: ['示例制造有限公司', '社保', '工伤'] },
      { topic: '劳动保障监察/行政处罚', terms: ['示例制造有限公司', '劳动保障监察', '行政处罚'] },
      { topic: '员工待遇', terms: ['示例制造有限公司', '员工待遇'] },
      { topic: '企业回应/情况说明', terms: ['示例制造有限公司', '企业回应', '情况说明'] }
    ])
    for (const query of queries) {
      expect(query.subjectId).toBe('subject-1')
      expect(searchQuerySchema.safeParse(query).success).toBe(true)
      expect(query).not.toHaveProperty('severityScore')
      expect(`${query.topic} ${query.terms.slice(1).join(' ')}`).not.toMatch(/黑心|良心|抵制|恶劣|黑名单|红黑榜|值得购买/)
    }
  })

  it('produces stable distinct IDs and fresh query values without mutating its subject', () => {
    const queries = buildLaborQueries(subject)
    expect(buildLaborQueries(subject)).toEqual(queries)
    expect(new Set(queries.map(({ id }) => id)).size).toBe(8)
    queries[0].terms.push('accidental mutation')
    expect(buildLaborQueries(subject)[0].terms).toEqual(['示例制造有限公司', '欠薪', '工资拖欠'])
    expect(subject.name).toBe('示例制造有限公司')
  })

  it('keeps different subjects separate even when their names are similar', () => {
    const first = buildLaborQueries(subject)
    const second = buildLaborQueries({ ...subject, id: 'subject-2', name: '示例制造（上海）有限公司' })
    expect(second.every(({ subjectId, terms }) => subjectId === 'subject-2' && terms[0] === '示例制造（上海）有限公司')).toBe(true)
    expect(second.some(({ id }) => first.some((query) => query.id === id))).toBe(false)
  })

  it('does not silently elevate an unverified keyword or substitute another entity', () => {
    const queries = buildLaborQueries({ ...subject, name: '示例品牌', role: 'brand', verification: 'unverified' })
    expect(queries.every(({ terms }) => terms[0] === '示例品牌')).toBe(true)
    expect(subject.verification).toBe('user-confirmed')
  })

  it('rejects blank subject names at the generation boundary', () => {
    expect(() => buildLaborQueries({ ...subject, name: '  ' })).toThrow()
  })
})
