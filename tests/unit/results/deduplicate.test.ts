import { describe, expect, it } from 'vitest'
import { deduplicateRecords } from '../../../src/main/results/deduplicate'
import type { SourceRecord } from '../../../src/shared/types'

const record = (id: string, url: string, accessedAt: string, queryId: string, connectorId = 'bing-rss'): SourceRecord => ({
  id, subjectId: 's1', title: '同一报道', sourceType: 'media', publisher: '新闻', url, accessedAt, excerpt: '报道内容', claimStatus: 'unverified',
  matchEvidence: [`${connectorId}/${queryId}`], availability: 'unknown', queryIds: [queryId], connectorIds: [connectorId]
})

describe('deduplicateRecords', () => {
  it('canonicalizes tracking parameters, fragments, and redirected canonical URLs', () => {
    const result = deduplicateRecords([
      { ...record('a', 'https://news.example.com/story?utm_source=bing&id=4#top', '2026-10-01T00:00:00.000Z', 'q1'), canonicalUrl: 'https://news.example.com/final?id=4' },
      { ...record('b', 'https://news.example.com/redirect', '2026-10-03T00:00:00.000Z', 'q2'), canonicalUrl: 'https://news.example.com/final?id=4&utm_medium=rss' }
    ])
    expect(result.records).toHaveLength(1)
    expect(result.records[0].canonicalUrl).toBe('https://news.example.com/final?id=4')
  })
  it('merges eight query hits and retains every query/connector plus access bounds', () => {
    const hits = Array.from({ length: 8 }, (_, i) => record(`r${i}`, `https://news.example.com/a?utm_campaign=${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, `q${i}`, i % 2 ? 'bing-rss' : 'other-feed'))
    const result = deduplicateRecords(hits)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({ queryIds: ['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'], connectorIds: ['bing-rss', 'other-feed'], accessedAt: '2026-10-01T00:00:00.000Z', latestAccessedAt: '2026-10-08T00:00:00.000Z' })
  })
  it('keeps same-title pages on separate domains distinct', () => {
    expect(deduplicateRecords([record('a', 'https://one.example/story', '2026-10-01T00:00:00.000Z', 'q1'), record('b', 'https://two.example/story', '2026-10-01T00:00:00.000Z', 'q2')]).records).toHaveLength(2)
  })
})
