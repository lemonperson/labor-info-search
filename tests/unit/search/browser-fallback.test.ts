import { expect, it, vi } from 'vitest'
import { buildBrowserFallback } from '../../../src/main/search/browser-fallback'
import type { SearchQuery } from '../../../src/shared/types'
const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }))
vi.mock('electron', () => ({ shell: { openExternal } }))

it('previews the exact encoded queries and visible trusted hostname without opening a browser', () => {
  const queries: SearchQuery[] = [{
    id: 'q', subjectId: 's', terms: ['示例 & 公司', '工资拖欠'], topic: '工资', siteScope: 'example.com'
  }]
  const preview = buildBrowserFallback('bing', queries)
  expect(preview.provider).toBe('bing')
  expect(preview.hostname).toBe('www.bing.com')
  expect(preview.queries).toEqual(['"示例 & 公司" "工资拖欠" site:example.com'])
  expect(preview.urls).toEqual(['https://www.bing.com/search?q=%22%E7%A4%BA%E4%BE%8B+%26+%E5%85%AC%E5%8F%B8%22+%22%E5%B7%A5%E8%B5%84%E6%8B%96%E6%AC%A0%22+site%3Aexample.com'])
  expect(new URL(preview.urls[0]).searchParams.get('q')).toBe(preview.queries[0])
  expect(openExternal).not.toHaveBeenCalled()
})
it('preserves query order and returns an empty preview without side effects', () => {
  expect(buildBrowserFallback('bing', [])).toEqual({ provider: 'bing', hostname: 'www.bing.com', queries: [], urls: [] })
})
it('rejects invalid site scopes rather than allowing URL or search operator injection', () => {
  expect(() => buildBrowserFallback('bing', [{ id: 'q', subjectId: 's', terms: ['公司'], topic: '工资', siteScope: 'example.com OR site:evil.com' }])).toThrow()
})
