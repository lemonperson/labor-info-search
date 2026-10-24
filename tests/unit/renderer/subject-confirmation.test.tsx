import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SubjectConfirmation } from '../../../src/renderer/src/features/subject/SubjectConfirmation'
import { candidatesFromLabelledText, confirmSubject, subjectCandidate } from '../../../src/renderer/src/features/subject/subject-state'

describe('subject confirmation', () => {
  it('rebuilds separate role candidates from edited OCR text', () => {
    expect(candidatesFromLabelledText('品牌 : 青 禾 生产 企业 : 深圳 先进 制造 有 限 公司')).toEqual([
      subjectCandidate('brand', '青禾', '品牌 : 青 禾 生产 企业 : 深圳 先进 制造 有 限 公司'),
      subjectCandidate('manufacturer', '深圳先进制造有限公司', '品牌 : 青 禾 生产 企业 : 深圳 先进 制造 有 限 公司')
    ])
  })

  it('renders candidates and their roles separately from the evidence', () => {
    const html = renderToStaticMarkup(<SubjectConfirmation
      candidates={[subjectCandidate('brand', '青禾', '包装标注：品牌 青禾'), subjectCandidate('manufacturer', '青禾食品有限公司', '生产企业：青禾食品有限公司')]}
      origin="screenshot" onConfirm={() => {}} />)
    expect(html).toContain('品牌')
    expect(html).toContain('生产企业')
    expect(html).toContain('包装标注：品牌青禾')
    expect(html).toContain('选择检索主体')
  })

  it('requires an explicit selection for ambiguous candidates and marks unverified confirmation', () => {
    const candidates = [subjectCandidate('brand', '青禾', '包装标注：品牌 青禾'), subjectCandidate('manufacturer', '青禾食品有限公司', '生产企业：青禾食品有限公司')]
    expect(confirmSubject(candidates, undefined, 'screenshot')).toBeUndefined()
    expect(confirmSubject(candidates, candidates[1].id, 'screenshot', '   ')).toBeUndefined()
    const result = confirmSubject(candidates, candidates[1].id, 'screenshot')
    expect(result).toMatchObject({ subject: { name: '青禾食品有限公司', role: 'manufacturer', verification: 'user-confirmed' }, verification: 'user-confirmed', origin: 'screenshot' })
    expect(result?.selectedEvidence).toEqual(['生产企业：青禾食品有限公司'])
    const html = renderToStaticMarkup(<SubjectConfirmation candidates={[subjectCandidate('unknown', '新公司', '手动输入')]} origin="company-name" onConfirm={() => {}} />)
    expect(html).toContain('主体尚未权威核验')
  })
})
