import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { safeFetchText } from '../../../src/main/security/safe-fetch'
import { resolveProductLink } from '../../../src/main/marketplace/link-resolver'

vi.mock('../../../src/main/security/safe-fetch', () => ({ safeFetchText: vi.fn() }))
const fetchText = vi.mocked(safeFetchText)
const fixture = (platform: string, file = 'metadata.html') => readFile(resolve('tests/fixtures/marketplace', platform, file), 'utf8')
const response = (url: string, text: string, contentType = 'text/html') => ({ ok: true as const, url, text, status: 200, contentType })

describe('resolveProductLink', () => {
  it('trims whitespace and removes tracking parameters while preserving the product URL', async () => {
    const url = 'https://item.taobao.com/item.htm?id=1001&utm_source=search&spm=abc'
    fetchText.mockResolvedValue(response('https://item.taobao.com/item.htm?id=1001', await fixture('taobao')))
    const result = await resolveProductLink(`  ${url}  `, new AbortController().signal)
    expect(fetchText).toHaveBeenCalledWith(new URL('https://item.taobao.com/item.htm?id=1001'), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(result.finalUrl).toBe('https://item.taobao.com/item.htm?id=1001')
  })

  it('uses the final redirect URL for platform detection and extraction', async () => {
    fetchText.mockResolvedValue(response('https://item.jd.com/2001.html', await fixture('jd')))
    const result = await resolveProductLink('https://3.cn/short', new AbortController().signal)
    expect(result.platform).toBe('jd')
    expect(result.productTitle).toBe('示例 JD 商品')
  })

  it.each([
    ['private network', 'http://127.0.0.1/item'],
    ['unsupported domain', 'https://example.org/item']
  ])('does not fetch %s URLs', async (_label, url) => {
    fetchText.mockClear()
    const result = await resolveProductLink(url, new AbortController().signal)
    expect(fetchText).not.toHaveBeenCalled()
    expect(result.status).toBe('unsupported')
  })

  it('returns blocked for login and CAPTCHA pages', async () => {
    fetchText.mockResolvedValueOnce(response('https://item.taobao.com/login', '<title>请登录</title><body>登录后继续</body>'))
    const login = await resolveProductLink('https://item.taobao.com/item.htm?id=1', new AbortController().signal)
    expect(login.status).toBe('blocked')
    fetchText.mockResolvedValueOnce(response('https://item.jd.com/captcha', '<title>验证</title><body>验证码 captcha</body>'))
    const captcha = await resolveProductLink('https://item.jd.com/1.html', new AbortController().signal)
    expect(captcha.status).toBe('blocked')
  })

  it('degrades oversized and cancelled fetches to blocked', async () => {
    fetchText.mockResolvedValueOnce({ ok: false, error: { code: 'response-too-large' } })
    expect((await resolveProductLink('https://item.taobao.com/item.htm?id=1', new AbortController().signal)).status).toBe('blocked')
    fetchText.mockResolvedValueOnce({ ok: false, error: { code: 'cancelled' } })
    expect((await resolveProductLink('https://item.taobao.com/item.htm?id=1', AbortSignal.abort())).status).toBe('blocked')
  })
})
