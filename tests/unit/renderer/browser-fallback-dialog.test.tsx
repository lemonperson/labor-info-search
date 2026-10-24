import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BrowserFallbackDialog } from '../../../src/renderer/src/features/results/BrowserFallbackDialog'
import { createBrowserFallbackHandlers } from '../../../src/main/ipc/register-ipc'
import type { SearchQuery } from '../../../src/shared/types'

describe('confirmed browser fallback', () => {
  it('shows the reason, provider, hostname, exact queries, and privacy explanation', () => {
    const html = renderToStaticMarkup(<BrowserFallbackDialog preview={{ previewId: '00000000-0000-4000-8000-000000000001', provider: 'bing', hostname: 'www.bing.com', reason: '自动检索未能完成', queries: ['"示例公司" "工资"'], expiresAt: '2026-10-24T00:05:00.000Z' }} onCancel={() => {}} onConfirm={async () => ({ ok: true })} />)
    expect(html).toContain('自动检索未能完成')
    expect(html).toContain('Bing')
    expect(html).toContain('www.bing.com')
    expect(html).toContain('在浏览器中打开此检索词？')
    expect(html).toContain('&quot;示例公司&quot; &quot;工资&quot;')
    expect(html).toContain('本次只会打开上方显示的这一条检索词')
    expect(html).toContain('搜索词会发送给 Bing')
    expect(html).toContain('取消')
    expect(html).toContain('确认并打开浏览器')
  })
  it('redeems an opaque exact-url token once and rejects tampering and expiry', async () => {
    let now = 1000
    const opened: string[] = []
    const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
    const handlers = createBrowserFallbackHandlers({ openExternal: async url => { opened.push(url) }, now: () => now, createId: () => ids.shift()! })
    const query: SearchQuery = { id: 'q', subjectId: 's', terms: ['示例公司', '工资'], topic: '工资' }
    const query2: SearchQuery = { id: 'q2', subjectId: 's', terms: ['示例公司', '劳动争议'], topic: '劳动争议' }
    const preview = await handlers['browser:preview']({ provider: 'bing', reason: '自动检索未能完成', queries: [query, query2] }) as { previewId: string; queries: string[] }
    expect(preview.previewId).toBe('00000000-0000-4000-8000-000000000001')
    expect(preview.queries).toEqual(['"示例公司" "工资"'])
    expect(opened).toEqual([])
    expect(await handlers['browser:open-confirmed']({ previewId: '00000000-0000-4000-8000-000000000001' })).toMatchObject({ ok: true })
    expect(opened).toEqual(['https://www.bing.com/search?q=%22%E7%A4%BA%E4%BE%8B%E5%85%AC%E5%8F%B8%22+%22%E5%B7%A5%E8%B5%84%22'])
    expect(await handlers['browser:open-confirmed']({ previewId: '00000000-0000-4000-8000-000000000001' })).toMatchObject({ ok: false })
    expect(await handlers['browser:open-confirmed']({ previewId: '00000000-0000-4000-8000-000000000099' })).toMatchObject({ ok: false })
    const expiring = await handlers['browser:preview']({ provider: 'bing', reason: '检索结果较少', queries: [query] }) as { previewId: string }
    now += 5 * 60 * 1000
    expect(await handlers['browser:open-confirmed']({ previewId: expiring.previewId })).toMatchObject({ ok: false })
    expect(opened).toHaveLength(1)
  })
})
