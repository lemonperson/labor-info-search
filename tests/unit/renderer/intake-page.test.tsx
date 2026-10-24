import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IntakePage } from '../../../src/renderer/src/features/intake/IntakePage'
import { validateIntake } from '../../../src/renderer/src/features/intake/intake-state'

describe('focused intake', () => {
  it('renders three keyboard-operable input modes and one primary action', () => {
    const html = renderToStaticMarkup(<IntakePage />)
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="企业或品牌名称"')
    expect(html).toContain('粘贴商品链接')
    expect(html).toContain('上传包装截图')
    expect((html.match(/type="submit"/g) ?? []).length).toBe(1)
    expect(html).toContain('来源可核验')
  })

  it('gives mode-specific validation without accepting blank input', () => {
    expect(validateIntake('company-name', '   ')).toBe('请输入企业或品牌名称。')
    expect(validateIntake('product-link', 'not a url')).toBe('请输入有效的商品链接。')
    expect(validateIntake('screenshot', '')).toBe('请选择商品包装或详情截图。')
  })
})
