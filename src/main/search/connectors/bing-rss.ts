import { randomUUID } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import type { SearchQuery, SourceRecord } from '../../../shared/types'
import { safeFetchText } from '../../security/safe-fetch'
import { toSafeDisplayText } from '../../security/text-safety'
import { formatSearchQuery } from '../browser-fallback'
import type { ConnectorResult, SearchConnector } from '../types'

type RssItem = Partial<Record<'title' | 'link' | 'description' | 'pubDate' | 'source', string>>
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function parseRss(text: string): RssItem[] | null {
  // RSS search does not require DTDs. Reject before parsing, including entity
  // declarations, so input cannot define or reference external entities.
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('DTD is not accepted')
  const parsed: unknown = new XMLParser({
    ignoreAttributes: true, ignoreDeclaration: true, ignorePiTags: true,
    parseTagValue: false, maxNestedTags: 32,
    processEntities: { enabled: true, maxEntityCount: 1, maxEntitySize: 256,
      maxTotalExpansions: 1000, maxExpandedLength: 4096 },
    isArray: (_name, path) => path === 'rss.channel.item'
  }).parse(text, true)
  if (!isObject(parsed) || Object.keys(parsed).length !== 1 || !isObject(parsed.rss) ||
    !Object.hasOwn(parsed.rss, 'channel')) return null
  const channel = parsed.rss.channel
  if (channel === '') return []
  if (!isObject(channel)) return null
  if (channel.item === undefined) return []
  if (!Array.isArray(channel.item)) return null
  return channel.item.filter(isObject).map((item) => {
    const result: RssItem = {}
    for (const field of ['title', 'link', 'description', 'pubDate', 'source'] as const) {
      if (typeof item[field] === 'string') result[field] = item[field]
    }
    return result
  })
}

/** Replaceable, best-effort public RSS search; no completeness or availability guarantee. */
export class BingRssConnector implements SearchConnector {
  readonly id = 'bing-rss'
  async search(query: SearchQuery, signal: AbortSignal): Promise<ConnectorResult> {
    if (signal.aborted) return { ok: false, error: { code: 'cancelled' } }
    const queryText = formatSearchQuery(query)
    const url = new URL('https://www.bing.com/search')
    url.searchParams.set('q', queryText)
    url.searchParams.set('format', 'rss')
    const fetched = await safeFetchText(url, { signal })
    if (!fetched.ok) {
      const code = fetched.error.code
      return { ok: false, error: { code: code === 'timeout' || code === 'cancelled' ? code
        : code === 'unsupported-content-type' || code === 'http-error' ? 'blocked_or_changed' : 'network_error' } }
    }
    if (signal.aborted) return { ok: false, error: { code: 'cancelled' } }
    if (['text/html', 'application/xhtml+xml'].includes(fetched.contentType) ||
      !/<rss(?:\s|\/?>)/.test(fetched.text)) return { ok: false, error: { code: 'blocked_or_changed' } }
    let items: RssItem[] | null
    try { items = parseRss(fetched.text) }
    catch { return { ok: false, error: { code: 'malformed_response' } } }
    if (items === null) return { ok: false, error: { code: 'blocked_or_changed' } }
    const accessedAt = new Date().toISOString(), records: SourceRecord[] = []
    for (const item of items) {
      const title = toSafeDisplayText(item.title ?? '', 500)
      let target: URL
      try { target = new URL(item.link?.trim() ?? '') } catch { continue }
      if (!title || !['https:', 'http:'].includes(target.protocol) || target.username || target.password) continue
      const published = item.pubDate ? Date.parse(item.pubDate) : NaN
      records.push({
        id: randomUUID(), subjectId: query.subjectId, title, url: target.href,
        publisher: toSafeDisplayText(item.source ?? '', 200) || target.hostname,
        ...(Number.isFinite(published) ? { publishedAt: new Date(published).toISOString() } : {}),
        accessedAt, sourceType: 'other', claimStatus: 'unverified', availability: 'unknown',
        excerpt: toSafeDisplayText(item.description ?? '', 1200),
        matchEvidence: [`检索线索（未经核验） ${this.id} / ${query.id}: ${queryText}`]
      })
    }
    return { ok: true, records }
  }
}
