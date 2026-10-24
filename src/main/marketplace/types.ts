import type { CheerioAPI } from 'cheerio'
import type { EntityCandidate } from '../../shared/types'

export type MarketplacePlatform = 'taobao' | 'jd' | 'douyin' | 'pinduoduo' | 'unknown'
export type ProductResolutionStatus = 'resolved' | 'partial' | 'blocked' | 'unsupported'

export interface MarketplaceEvidence {
  platform: MarketplacePlatform
  source: 'metadata' | 'json-ld' | 'visible-label'
  field: string
  excerpt: string
}

export interface ProductResolution {
  platform: MarketplacePlatform
  productTitle: string
  finalUrl: string
  candidates: EntityCandidate[]
  evidence: MarketplaceEvidence[]
  warnings: string[]
  status: ProductResolutionStatus
}

export interface MarketplaceAdapter {
  readonly platform: Exclude<MarketplacePlatform, 'unknown'>
  canHandle(url: string | URL): boolean
  extract(document: CheerioAPI, finalUrl: URL): ProductResolution
}
