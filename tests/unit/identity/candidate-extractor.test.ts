import { describe, expect, it } from 'vitest'
import { extractEntityCandidates } from '../../../src/main/identity/candidate-extractor'

describe('extractEntityCandidates', () => {
  it('keeps package labels as separate candidate roles', () => {
    const candidates = extractEntityCandidates([
      '品牌：青禾',
      '生产企业：深圳先进制造有限公司',
      '委托方：清源食品集团有限公司',
      '经销商：华南商贸有限公司'
    ].join('\n'))
    expect(candidates.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: '青禾', role: 'brand' },
      { name: '深圳先进制造有限公司', role: 'manufacturer' },
      { name: '清源食品集团有限公司', role: 'commissioning-party' },
      { name: '华南商贸有限公司', role: 'distributor' }
    ])
    expect(candidates[1].evidence).toEqual(['生产企业：深圳先进制造有限公司'])
  })

  it('normalizes whitespace and repeated OCR lines without merging distinct names', () => {
    const candidates = extractEntityCandidates([
      '制造商：深 圳 先 进 制 造 有 限 公 司',
      '制造商：深圳先进制造有限公司',
      '制造商：清源食品有限公司'
    ].join('\n'))
    expect(candidates.map(({ name }) => name)).toEqual(['深圳先进制造有限公司', '清源食品有限公司'])
    expect(candidates[0].evidence).toHaveLength(2)
  })

  it('returns no guessed candidates for label-free text', () => {
    expect(extractEntityCandidates('本品净含量 500 克\n保质期 12 个月')).toEqual([])
  })

  it('preserves different role/name candidates instead of merging them', () => {
    const candidates = extractEntityCandidates('品牌：青禾\n制造商：青禾食品有限公司')
    expect(candidates).toHaveLength(2)
    expect(candidates.map(({ role }) => role)).toEqual(['brand', 'manufacturer'])
  })
})

  it('recognizes labels and names with OCR-inserted Han character spaces', () => {
    const candidates = extractEntityCandidates('生产 企业 : 深 圳 先 进 制 造 有 限 公 司')
    expect(candidates.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: '深圳先进制造有限公司', role: 'manufacturer' }
    ])
  })
