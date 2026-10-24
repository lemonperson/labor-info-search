export type IntakeMode = 'company-name' | 'product-link' | 'screenshot'

export function validateIntake(mode: IntakeMode, raw: string): string | undefined {
  const value = raw.trim()
  if (!value) {
    if (mode === 'product-link') return '请输入商品链接。'
    if (mode === 'screenshot') return '请选择商品包装或详情截图。'
    return '请输入企业或品牌名称。'
  }
  if (mode === 'product-link') {
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid')
    } catch { return '请输入有效的商品链接。' }
  }
  return undefined
}
