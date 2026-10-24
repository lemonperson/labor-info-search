import { searchQuerySchema } from '../../shared/schemas'
import type { SearchQuery } from '../../shared/types'

export function formatSearchQuery(query: SearchQuery): string {
  const parsed = searchQuerySchema.parse(query)
  const terms = parsed.terms.map((term) => '"' + term.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"')
  if (parsed.siteScope) terms.push(`site:${parsed.siteScope}`)
  return terms.join(' ')
}

/** Pure preview; opening URLs requires a separate user-confirmed action. */
export function buildBrowserFallback(provider: 'bing', queries: SearchQuery[]) {
  if (provider !== 'bing') throw new TypeError('Unsupported search provider')
  const text = queries.map(formatSearchQuery)
  return {
    provider, hostname: 'www.bing.com', queries: text,
    urls: text.map((query) => {
      const url = new URL('https://www.bing.com/search')
      url.searchParams.set('q', query)
      return url.href
    })
  }
}
