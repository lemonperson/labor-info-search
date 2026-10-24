import { describe, expect, it } from 'vitest'
import { classifySource } from '../../../src/main/results/classify-source'
import type { SourceRegistry } from '../../../src/shared/types'

const registry: SourceRegistry = { version: 1, sources: [
  { id: 'gov', name: 'Government', sourceType: 'government', homepageUrl: 'https://www.gov.cn/', enabled: true, requestsPerMinute: 10, cacheTtlSeconds: 0 },
  { id: 'court', name: 'Court', sourceType: 'court-arbitration', homepageUrl: 'https://www.court.gov.cn/', enabled: true, requestsPerMinute: 10, cacheTtlSeconds: 0 },
  { id: 'media', name: 'Media', sourceType: 'media', homepageUrl: 'https://news.example.com/', enabled: true, requestsPerMinute: 10, cacheTtlSeconds: 0 },
  { id: 'disabled', name: 'Disabled media', sourceType: 'media', homepageUrl: 'https://disabled.example.com/', enabled: false, requestsPerMinute: 10, cacheTtlSeconds: 0 }
] }

describe('classifySource', () => {
  it('classifies government and court domains from registry/domain metadata', () => {
    expect(classifySource('https://notice.gov.cn/a', 'notice.gov.cn', registry).sourceType).toBe('government')
    expect(classifySource('https://court.gov.cn/a', '法院', registry).sourceType).toBe('court-arbitration')
  })
  it('matches configured media hosts and subdomains', () => {
    expect(classifySource('https://local.news.example.com/a', 'Publisher', registry).sourceType).toBe('media')
  })
  it('keeps social platforms and unconfigured favorable wording as other', () => {
    expect(classifySource('https://weibo.com/a', '企业回应：经营稳健', registry).sourceType).toBe('other')
  })
  it('keeps unknown and disabled registry domains as other', () => {
    expect(classifySource('https://unknown.example/a', 'Company says all is well', registry).sourceType).toBe('other')
    expect(classifySource('https://disabled.example.com/a', 'Publisher', registry).sourceType).toBe('other')
  })
})
