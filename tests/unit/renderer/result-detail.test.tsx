import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultDetail } from '../../../src/renderer/src/features/results/ResultDetail'
import type { SearchSession, SourceRecord } from '../../../src/shared/types'

const record: SourceRecord = { id: 'r1', subjectId: 's', title: '<script>alert(1)</script>', sourceType: 'company-response', publisher: '示例企业', url: 'https://example.com/a?b=1', publishedAt: '2026-01-01', accessedAt: '2026-10-24T00:00:00Z', excerpt: '<img src=x onerror=alert(1)> 较长来源摘录内容', claimStatus: 'unverified', matchEvidence: ['名称出现在正文'], availability: 'unavailable', relatedRecordIds: ['r2'] }
const related: SourceRecord = { ...record, id: 'r2', title: '后续回应', sourceType: 'media', url: 'https://news.example.com/followup', relatedRecordIds: [] }
const session: SearchSession = { id: 'session', inputType: 'company-name', subject: { id: 's', name: '示例公司', role: 'unknown', verification: 'user-confirmed', evidence: [] }, queries: [], records: [record, related], eventGroups: [{ id: 'e1', subjectId: 's', title: '相关事件', recordIds: ['r1', 'r2'], status: 'suggested', matchEvidence: ['同一主体'] }], startedAt: '2026-10-24T00:00:00Z', completedAt: '2026-10-24T00:01:00Z', status: 'completed', connectorRuns: [] }

describe('result detail', () => {
  it('shows the original source, match evidence, unavailable state, and related follow-up as inert text', () => {
    const html = renderToStaticMarkup(<ResultDetail session={session} record={record} onBack={() => {}} onPreviewSource={() => {}} />)
    expect(html).toContain('https://example.com/a?b=1')
    expect(html).toContain('example.com')
    expect(html).toContain('名称出现在正文')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('页面可能已删除或暂时无法访问')
    expect(html).toContain('后续回应')
    expect(html).toContain('返回检索结果')
    expect(html).toContain('打开原文前确认')
    expect(html).toContain('主体尚未权威核验')
    expect(html).toContain('可能相关的来源（建议分组）')
    expect(html).toContain('仅供人工复核')
  })
})
