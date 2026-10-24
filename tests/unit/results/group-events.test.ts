import { describe, expect, it } from 'vitest'
import { groupRelatedEvents } from '../../../src/main/results/group-events'
import type { SourceRecord } from '../../../src/shared/types'

const record = (id: string, title: string, publishedAt: string, evidence = '示例公司劳动争议'): SourceRecord => ({
  id, subjectId: 's1', title, sourceType: 'media', publisher: '新闻', url: `https://news.example.com/${id}`, publishedAt,
  accessedAt: '2026-10-24T00:00:00.000Z', excerpt: `${evidence}，劳动争议相关信息。`, claimStatus: 'unverified', matchEvidence: [evidence], availability: 'unknown'
})

describe('groupRelatedEvents', () => {
  it('suggests a group for report, company response, and follow-up with overlapping evidence', () => {
    const groups = groupRelatedEvents([
      record('r1', '示例公司劳动争议调查报道', '2026-10-01'),
      record('r2', '示例公司发布劳动争议情况说明', '2026-10-02'),
      record('r3', '示例公司劳动争议事件后续', '2026-10-04')
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ recordIds: ['r1', 'r2', 'r3'], status: 'suggested' })
    expect(groups[0].matchEvidence.length).toBeGreaterThan(0)
    expect(groupRelatedEvents([
      record('r1', '示例公司劳动争议调查报道', '2026-10-01'),
      record('r2', '示例公司发布劳动争议情况说明', '2026-10-02'),
      record('r3', '示例公司劳动争议事件后续', '2026-10-04')
    ])).toEqual(groups)
  })
  it('keeps unrelated same-day pages separate', () => {
    expect(groupRelatedEvents([record('a', '甲公司食品召回', '2026-10-01', '甲公司'), record('b', '乙公司产品涨价', '2026-10-01', '乙公司')])).toHaveLength(0)
    expect(groupRelatedEvents([record('c', '示例公司食品召回', '2026-10-01', '示例公司'), record('d', '示例公司产品涨价', '2026-10-01', '示例公司')])).toHaveLength(0)
  })
})
