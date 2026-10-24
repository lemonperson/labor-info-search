import type { CheerioAPI } from 'cheerio'
import { toSafeDisplayText } from '../../../main/security/text-safety'
import type { EntityCandidate } from '../../../shared/types'
import type { MarketplaceAdapter, MarketplaceEvidence, MarketplacePlatform, ProductResolution } from '../types'

type Role = EntityCandidate['role']
type SourceValue = { name: string; role: Role; source: MarketplaceEvidence['source']; field: string }
const MAX_EXCERPT = 240
const labelRules: Array<{ pattern: RegExp; role: Role }> = [
  { pattern: /^(?:品牌|品牌名称|brand)$/i, role: 'brand' },
  { pattern: /^(?:店铺|店铺名称|卖家|商家|seller|store)$/i, role: 'store-operator' },
  { pattern: /^(?:生产企业|生产厂家|生产商|制造商|制造企业|manufacturer)$/i, role: 'manufacturer' },
  { pattern: /^(?:委托方|委托企业|委托生产企业|commissioning party)$/i, role: 'commissioning-party' },
  { pattern: /^(?:经销商|经销企业|distributor)$/i, role: 'distributor' }
]

function clean(value: string | undefined, max = MAX_EXCERPT): string {
  return value ? toSafeDisplayText(value, max) : ''
}
function visible(element: ReturnType<CheerioAPI>): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], script, style, noscript, template').length) return false
  const style = (element.attr('style') ?? '').replace(/\s/g, '').toLowerCase()
  return !/display:none|visibility:hidden/.test(style)
}
function roleFor(label: string): Role | undefined {
  const normalized = clean(label, 80).replace(/[：:]$/, '').trim()
  return labelRules.find(({ pattern }) => pattern.test(normalized))?.role
}
function nestedName(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return nestedName(value[0])
  if (typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string') return value.name
  return undefined
}
function jsonLdValues($: CheerioAPI): SourceValue[] {
  const values: SourceValue[] = []
  $('script[type="application/ld+json"]').each((index, element) => {
    let parsed: unknown
    try { parsed = JSON.parse($(element).text()) as unknown } catch { return }
    const visit = (value: unknown, path: string): void => {
      if (Array.isArray(value)) { value.forEach((child, childIndex) => visit(child, `${path}[${childIndex}]`)); return }
      if (typeof value !== 'object' || value === null) return
      const record = value as Record<string, unknown>
      if (record['@graph']) visit(record['@graph'], `${path}.@graph`)
      const type = String(record['@type'] ?? '').toLowerCase()
      if (type === 'product' || (record.name && (record.brand || record.manufacturer || record.seller))) {
        const mappings: Array<[string, Role]> = [['brand', 'brand'], ['seller', 'store-operator'], ['manufacturer', 'manufacturer']]
        for (const [key, role] of mappings) {
          const name = clean(nestedName(record[key]))
          if (name) values.push({ name, role, source: 'json-ld', field: `script[type=application/ld+json]#${index}.${key}` })
        }
      }
      for (const [key, child] of Object.entries(record)) {
        if (key !== '@graph' && typeof child === 'object' && child !== null) visit(child, `${path}.${key}`)
      }
    }
    visit(parsed, `script[type=application/ld+json]#${index}`)
  })
  return values
}
function visibleLabelValues($: CheerioAPI): SourceValue[] {
  const values: SourceValue[] = []
  $('dt, th').each((_index, element) => {
    const label = clean($(element).text(), 80)
    const role = roleFor(label)
    if (!role || !visible($(element))) return
    const valueElement = $(element).is('dt') ? $(element).next('dd') : $(element).next('td')
    const name = clean(valueElement.text())
    if (name && visible(valueElement)) values.push({ name, role, source: 'visible-label', field: label.replace(/[：:]$/, '') })
  })
  $('body *').each((_index, element) => {
    const node = $(element)
    if (node.children().length || !visible(node)) return
    const text = clean(node.text())
    const match = text.match(/^([^：:]{1,40})[：:]\s*(.+)$/u)
    if (!match) return
    const role = roleFor(match[1])
    const name = clean(match[2])
    if (role && name) values.push({ name, role, source: 'visible-label', field: clean(match[1], 80).replace(/[：:]$/, '') })
  })
  return values
}
function metadataValues($: CheerioAPI): { title: string; values: SourceValue[] } {
  const values: SourceValue[] = []
  let title = clean($('meta[property="og:title" i]').first().attr('content') ?? $('meta[name="twitter:title" i]').first().attr('content') ?? $('title').first().text())
  const add = (selector: string, role: Role) => {
    const node = $(selector).first()
    if (!node.length) return
    const name = clean(node.attr('content') ?? node.text())
    const attribute = node.attr('property') !== undefined ? 'property' : 'name'
    const field = `meta[${attribute}=${node.attr(attribute)}]`
    if (name) values.push({ name, role, source: 'metadata', field })
  }
  add('meta[property="product:brand" i], meta[name="brand" i]', 'brand')
  add('meta[property="product:seller" i], meta[name="seller" i]', 'store-operator')
  add('meta[property="product:manufacturer" i], meta[name="manufacturer" i]', 'manufacturer')
  if (!title) title = clean($('h1').first().text())
  return { title, values }
}

export function createMarketplaceAdapter(platform: Exclude<MarketplacePlatform, 'unknown'>, domains: string[]): MarketplaceAdapter {
  const domainMatches = (host: string) => domains.some((domain) => host === domain || host.endsWith(`.${domain}`))
  return {
    platform,
    canHandle(value) {
      try {
        const url = value instanceof URL ? value : new URL(value)
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && domainMatches(url.hostname.toLowerCase().replace(/\.$/, ''))
      } catch { return false }
    },
    extract(document, finalUrl): ProductResolution {
      const metadata = metadataValues(document)
      const observations = [...metadata.values, ...jsonLdValues(document), ...visibleLabelValues(document)]
      const evidence: MarketplaceEvidence[] = []
      const candidates: EntityCandidate[] = []
      for (const observation of observations) {
        const excerpt = clean(observation.name)
        const found = evidence.find((item) => item.source === observation.source && item.field === observation.field && item.excerpt === excerpt)
        if (found) continue
        const item: MarketplaceEvidence = { platform, source: observation.source, field: observation.field, excerpt }
        evidence.push(item)
        let candidate = candidates.find((entry) => entry.role === observation.role && entry.name === observation.name)
        if (!candidate) {
          candidate = { id: `${platform}:${observation.role}:${candidates.length + 1}`, name: observation.name, role: observation.role, evidence: [] }
          candidates.push(candidate)
        }
        candidate.evidence.push(`${observation.field} (${observation.source}): ${excerpt}`)
      }
      if (metadata.title) evidence.unshift({ platform, source: 'metadata', field: 'og:title/title', excerpt: metadata.title })
      const hasManufacturer = candidates.some(({ role }) => role === 'manufacturer')
      const warnings = hasManufacturer ? [] : ['未从公开商品静态信息中找到明确标注的生产企业；未推测制造商。']
      return {
        platform, productTitle: metadata.title, finalUrl: finalUrl.href, candidates, evidence, warnings,
        status: hasManufacturer ? 'resolved' : 'partial'
      }
    }
  }
}
