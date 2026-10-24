import { expect, it } from 'vitest'
import { BingRssConnector } from '../../src/main/search/connectors/bing-rss'
it.skipIf(process.env.RUN_NETWORK_SMOKE !== '1')('Bing returns a typed outcome within 15 seconds', async () => {
  const result = await new BingRssConnector().search({
    id: 'smoke', subjectId: 'smoke', terms: ['劳动信息', '公开信息'], topic: '公开信息'
  }, AbortSignal.timeout(12_000))
  expect(typeof result.ok).toBe('boolean')
  if (result.ok) expect(Array.isArray(result.records)).toBe(true)
  else expect(['blocked_or_changed', 'malformed_response', 'network_error', 'timeout', 'cancelled', 'connector_error']).toContain(result.error.code)
}, 15_000)
