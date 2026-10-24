import { readFileSync } from 'node:fs'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { BingRssConnector } from '../../../src/main/search/connectors/bing-rss'
import * as network from '../../../src/main/security/safe-fetch'
import { sourceRecordSchema } from '../../../src/shared/schemas'
import type { SearchQuery } from '../../../src/shared/types'

const query: SearchQuery = { id: 'q1', subjectId: 's1', terms: ['示例公司', '欠薪'], topic: '欠薪' }
const fixture = (name: string) => readFileSync(new URL(`../../fixtures/search/${name}`, import.meta.url), 'utf8')
const response = (text: string, contentType = 'application/rss+xml'): network.SafeFetchResult =>
  ({ ok: true, url: 'https://www.bing.com/search?format=rss', status: 200, contentType, text })
afterEach(() => vi.restoreAllMocks())

describe('Bing RSS best-effort connector', () => {
  it('maps RSS into unverified raw records with query provenance and safe display text', async () => {
    let requested: URL | undefined
    vi.spyOn(network, 'safeFetchText').mockImplementation(async (url) => { requested = url; return response(fixture('bing-success.xml')) })
    const result = await new BingRssConnector().search(query, new AbortController().signal)
    expect(requested?.hostname).toBe('www.bing.com')
    expect(requested?.searchParams.get('format')).toBe('rss')
    expect(requested?.searchParams.get('q')).toBe('"示例公司" "欠薪"')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.records).toHaveLength(2)
    const [first, second] = result.records
    expect(first).toMatchObject({
      subjectId: 's1', title: '示例公司 劳动争议', url: 'https://news.example.com/article?a=1&b=2',
      publisher: 'news.example.com', publishedAt: '2026-10-24T08:00:00.000Z',
      excerpt: '员工公开陈述 & 回应', sourceType: 'other', claimStatus: 'unverified', availability: 'unknown',
      matchEvidence: ['检索线索（未经核验） bing-rss / q1: "示例公司" "欠薪"']
    })
    expect(second.publisher).toBe('公开媒体')
    expect(second.publishedAt).toBeUndefined()
    result.records.forEach((record) => expect(sourceRecordSchema.safeParse(record).success).toBe(true))
  })
  it('returns malformed_response for malformed XML', async () => {
    vi.spyOn(network, 'safeFetchText').mockResolvedValue(response(fixture('bing-malformed.xml')))
    expect(await new BingRssConnector().search(query, new AbortController().signal))
      .toEqual({ ok: false, error: { code: 'malformed_response' } })
  })
  it.each([
    ['<html><body>CAPTCHA</body></html>', 'text/html'],
    ['<html>captcha', 'text/plain'],
    ['{"error":"changed"}', 'application/json'],
    ['<feed><entry/></feed>', 'application/xml'],
    ['<rss/>', 'application/rss+xml']
  ])('returns blocked_or_changed for non-RSS response %s', async (body, mime) => {
    vi.spyOn(network, 'safeFetchText').mockResolvedValue(response(body, mime))
    expect(await new BingRssConnector().search(query, new AbortController().signal))
      .toEqual({ ok: false, error: { code: 'blocked_or_changed' } })
  })
  it('rejects DTD/entity payloads without resolving external entities', async () => {
    vi.spyOn(network, 'safeFetchText').mockResolvedValue(response('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss><channel><item><title>&x;</title></item></channel></rss>'))
    expect(await new BingRssConnector().search(query, new AbortController().signal))
      .toEqual({ ok: false, error: { code: 'malformed_response' } })
  })
  it('accepts an empty valid channel as zero results', async () => {
    vi.spyOn(network, 'safeFetchText').mockResolvedValue(response('<rss version="2.0"><channel><title>Bing</title></channel></rss>'))
    expect(await new BingRssConnector().search(query, new AbortController().signal)).toEqual({ ok: true, records: [] })
  })
  it.each([['timeout', 'timeout'], ['cancelled', 'cancelled'], ['unsupported-content-type', 'blocked_or_changed'], ['network-error', 'network_error']] as const)(
    'maps safe-fetch %s into a stable connector failure', async (code, expected) => {
      vi.spyOn(network, 'safeFetchText').mockResolvedValue({ ok: false, error: { code } })
      expect(await new BingRssConnector().search(query, new AbortController().signal))
        .toEqual({ ok: false, error: { code: expected } })
    })
  it('does not start a request for an already-cancelled query', async () => {
    const fetch = vi.spyOn(network, 'safeFetchText')
    expect(await new BingRssConnector().search(query, AbortSignal.abort())).toEqual({ ok: false, error: { code: 'cancelled' } })
    expect(fetch).not.toHaveBeenCalled()
  })
})

it('rejects excessively nested XML before it can monopolize the main process', async () => {
  const body = '<rss><channel>' + '<nested>'.repeat(80) + '</nested>'.repeat(80) + '</channel></rss>'
  vi.spyOn(network, 'safeFetchText').mockResolvedValue(response(body))
  expect(await new BingRssConnector().search(query, new AbortController().signal))
    .toEqual({ ok: false, error: { code: 'malformed_response' } })
})
