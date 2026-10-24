import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { load } from 'cheerio'
import { taobaoAdapter } from '../../../src/main/marketplace/adapters/taobao'
import { jdAdapter } from '../../../src/main/marketplace/adapters/jd'
import { douyinAdapter } from '../../../src/main/marketplace/adapters/douyin'
import { pinduoduoAdapter } from '../../../src/main/marketplace/adapters/pinduoduo'

const fixture = (platform: string, file = 'metadata.html') => readFile(resolve('tests/fixtures/marketplace', platform, file), 'utf8')
const adapters = [
  ['taobao', taobaoAdapter, ['https://item.taobao.com/item.htm?id=1', 'https://detail.tmall.com/item.htm?id=1']],
  ['jd', jdAdapter, ['https://item.jd.com/1.html', 'https://u.jd.com/abc']],
  ['douyin', douyinAdapter, ['https://v.douyin.com/abc/', 'https://haohuo.jinritemai.com/views/product/item2?id=1']],
  ['pinduoduo', pinduoduoAdapter, ['https://mobile.yangkeduo.com/goods.html?goods_id=1', 'https://mobile.pinduoduo.com/goods.html?goods_id=1']]
] as const

describe.each(adapters)('%s marketplace adapter', (platform, adapter, urls) => {
  it('recognizes marketplace product and short-link hosts', () => {
    for (const url of urls) expect(adapter.canHandle(url)).toBe(true)
    expect(adapter.canHandle('https://example.org/item')).toBe(false)
  })

  it('extracts distinct evidence-backed entity roles without guessing the manufacturer', async () => {
    const html = await fixture(platform)
    const result = adapter.extract(load(html), new URL(urls[0]))
    const roles = result.candidates.map(({ role }) => role)
    expect(result.productTitle).toBeTruthy()
    expect(roles).toContain('brand')
    expect(roles).toContain('store-operator')
    expect(roles).toContain('commissioning-party')
    expect(roles).not.toContain('manufacturer')
    expect(result.status).toBe('partial')
    expect(result.evidence.every(({ field, excerpt }) => field && excerpt && excerpt.length <= 300)).toBe(true)
  })

  it('promotes only an explicitly labeled manufacturer field', async () => {
    const html = await fixture(platform, 'manufacturer.html')
    const result = adapter.extract(load(html), new URL(urls[0]))
    expect(result.candidates).toContainEqual(expect.objectContaining({ name: '示例制造有限公司', role: 'manufacturer' }))
    expect(result.candidates).toContainEqual(expect.objectContaining({ name: '示例委托企业', role: 'commissioning-party' }))
    expect(result.candidates.find(({ role }) => role === 'manufacturer')?.name)
      .not.toBe(result.candidates.find(({ role }) => role === 'commissioning-party')?.name)
    expect(result.status).toBe('resolved')
  })
})

it('extracts JSON-LD manufacturer evidence and ignores hidden labeled fields', () => {
  const html = `<html><head><title>JSON 商品</title><script type="application/ld+json">{"@type":"Product","name":"JSON 商品","brand":{"name":"JSON 品牌"},"seller":{"name":"JSON 店铺"},"manufacturer":{"name":"JSON 制造商"}}</script></head><body><div hidden>制造商：隐藏制造商</div><div>委托方：委托主体</div></body></html>`
  const result = jdAdapter.extract(load(html), new URL('https://item.jd.com/1.html'))
  expect(result.candidates).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'JSON 品牌', role: 'brand' }),
    expect.objectContaining({ name: 'JSON 店铺', role: 'store-operator' }),
    expect.objectContaining({ name: 'JSON 制造商', role: 'manufacturer' }),
    expect.objectContaining({ name: '委托主体', role: 'commissioning-party' })
  ]))
  expect(result.candidates).not.toContainEqual(expect.objectContaining({ name: '隐藏制造商' }))
  expect(result.status).toBe('resolved')
  expect(result.evidence.some(({ source, field }) => source === 'json-ld' && field.includes('.manufacturer'))).toBe(true)
})
