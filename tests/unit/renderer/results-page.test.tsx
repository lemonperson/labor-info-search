import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultsPage } from '../../../src/renderer/src/features/results/ResultsPage'
import { orderRecords, filterRecords } from '../../../src/renderer/src/features/results/results-state'
import type { SearchSession, SourceRecord } from '../../../src/shared/types'

const records: SourceRecord[] = [
  { id: 'older', subjectId: 's', title: '劳动争议记录', sourceType: 'media', publisher: '公开报', url: 'https://news.example.com/old', publishedAt: '2025-01-01', accessedAt: '2026-10-24T00:00:00Z', excerpt: '旧资料摘录', claimStatus: 'unverified', matchEvidence: ['主体名称出现在正文', '两项事件线索'], availability: 'available' },
  { id: 'newer', subjectId: 's', title: '劳动争议处理进展', sourceType: 'government', publisher: '公开部门', url: 'https://gov.example.com/new', publishedAt: '2026-01-01', accessedAt: '2026-10-24T00:00:00Z', excerpt: '新资料摘录', claimStatus: 'unverified', matchEvidence: ['主体名称和事件词匹配'], availability: 'available' }
]
const session: SearchSession = { id: 'session', inputType: 'company-name', subject: { id: 's', name: '示例公司', role: 'unknown', verification: 'user-confirmed', evidence: ['手动输入'] }, queries: [], records, eventGroups: [], startedAt: '2026-10-24T00:00:00Z', completedAt: '2026-10-24T00:01:00Z', status: 'partial', connectorRuns: [{ connectorId: 'bing', status: 'failed', message: '受阻' }] }

describe('results page', () => {
  it('keeps source type filters factual and orders records by relevance unless time ordering is selected', () => {
    expect(orderRecords(records, 'relevance').map(record => record.id)).toEqual(['older', 'newer'])
    expect(orderRecords(records, 'time').map(record => record.id)).toEqual(['newer', 'older'])
    expect(filterRecords(records, ['government']).map(record => record.id)).toEqual(['newer'])
  })
  it('shows factual provenance and uncertainty without scoring or purchasing advice', () => {
    const html = renderToStaticMarkup(<ResultsPage session={session} />)
    expect(html).toContain('公开部门')
    expect(html).toContain('主体角色：未确认')
    expect(html).toContain('主体尚未权威核验')
    expect(html).toContain('2026-01-01')
    expect(html).toContain('劳动争议处理进展')
    expect(html).toContain('新资料摘录')
    expect(html).toContain('尚未独立核实')
    expect(html).toContain('部分来源未能完成检索')
    const resultContent = html.slice(html.indexOf('<main'), html.indexOf('</main>') + '</main>'.length)
    expect(resultContent).not.toMatch(/评分|购买建议|推荐购买/)
  })
})
