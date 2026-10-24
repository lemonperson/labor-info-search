import { load } from 'cheerio'
import { safeFetchText } from '../security/safe-fetch'
import type { MarketplaceAdapter, MarketplacePlatform, ProductResolution } from './types'
import { douyinAdapter } from './adapters/douyin'
import { jdAdapter } from './adapters/jd'
import { pinduoduoAdapter } from './adapters/pinduoduo'
import { taobaoAdapter } from './adapters/taobao'

const adapters: MarketplaceAdapter[] = [taobaoAdapter, jdAdapter, douyinAdapter, pinduoduoAdapter]
const trackingKey = /^(?:utm_.+|spm|scm|pvid|from|source|share_source|share_channel|track|traceid)$/i

function platformFor(url: string | URL): MarketplaceAdapter | undefined {
  return adapters.find((adapter) => adapter.canHandle(url))
}
function cleanUrl(rawUrl: string): URL | undefined {
  try {
    const url = new URL(rawUrl.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (trackingKey.test(key)) url.searchParams.delete(key)
    return url
  } catch { return undefined }
}
function empty(platform: MarketplacePlatform, finalUrl: string, status: ProductResolution['status'], warning: string): ProductResolution {
  return { platform, productTitle: '', finalUrl, candidates: [], evidence: [], warnings: [warning], status }
}
function blockedPage(html: string): boolean {
  const $ = load(html)
  const title = $('title').text()
  const text = $('body').text()
  return /请登录|登录后(?:继续|查看|购买)|滑动验证|安全验证|验证码|访问过于频繁|captcha|robot check|access denied|forbidden/i.test(`${title}\n${text}`)
}

/** Resolve product metadata from public static page content through the guarded fetch path. */
export async function resolveProductLink(rawUrl: string, signal: AbortSignal): Promise<ProductResolution> {
  const url = cleanUrl(rawUrl)
  if (!url) return empty('unknown', '', 'unsupported', '链接格式不受支持。')
  const initialAdapter = platformFor(url)
  if (!initialAdapter) return empty('unknown', url.href, 'unsupported', '链接域名不属于支持的购物平台。')
  if (signal.aborted) return empty(initialAdapter.platform, url.href, 'blocked', '请求已取消。')

  const fetched = await safeFetchText(url, { signal })
  if (!fetched.ok) return empty(initialAdapter.platform, url.href, 'blocked', `无法安全读取商品页（${fetched.error.code}）。`)
  let finalUrl: URL
  try { finalUrl = cleanUrl(fetched.url) ?? new URL('') }
  catch { return empty(initialAdapter.platform, url.href, 'blocked', '跳转后的链接无效。') }
  const finalAdapter = platformFor(finalUrl)
  if (!finalAdapter) return empty('unknown', finalUrl.href, 'unsupported', '商品页跳转到了不支持的平台。')
  if (!['text/html', 'application/xhtml+xml'].includes(fetched.contentType)) return empty(finalAdapter.platform, finalUrl.href, 'blocked', '商品页未返回可解析的 HTML。')
  if (blockedPage(fetched.text)) return empty(finalAdapter.platform, finalUrl.href, 'blocked', '商品页需要登录或安全验证，未尝试绕过。')
  try {
    const result = finalAdapter.extract(load(fetched.text), finalUrl)
    if (signal.aborted) return empty(finalAdapter.platform, finalUrl.href, 'blocked', '请求已取消。')
    return result
  } catch {
    return empty(finalAdapter.platform, finalUrl.href, 'blocked', '商品页内容无法安全解析。')
  }
}
