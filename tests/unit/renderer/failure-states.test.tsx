import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FailureState, type FailureKind } from '../../../src/renderer/src/components/FailureState'

const cases: Array<[FailureKind, string, string]> = [
  ['offline', '网络暂时不可用', '检查网络连接'],
  ['no-results', '暂时没有找到公开来源', '调整主体名称'],
  ['link-blocked', '商品页暂时无法读取', '手动输入企业名称'],
  ['ocr-low-confidence', '截图文字识别不够清晰', '编辑识别文字'],
  ['source-unavailable', '这个来源暂时无法打开', '返回检索结果'],
  ['connectors-failed', '所有自动来源都未能完成检索', '在浏览器中继续搜索'],
  ['database-recovery', '本机记录暂时无法读取', '重新打开应用']
]

describe('actionable failure states', () => {
  it.each(cases)('%s explains what happened and offers a safe next action', (kind, message, action) => {
    const html = renderToStaticMarkup(<FailureState kind={kind} onAction={() => {}} />)
    expect(html).toContain(message)
    expect(html).toContain(action)
    expect(html).toContain('role="status"')
  })
})
