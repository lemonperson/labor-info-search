import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BrowserFallbackPreview, SearchSession, SourcePreview, SourceRecord, SourceType } from '../../../../shared/types'
import { laborApi } from '../../api/labor-api'
import { AppChrome } from '../../components/AppChrome'
import { EmptyState } from '../../components/EmptyState'
import { ResultDetail } from './ResultDetail'
import { ResultFilters } from './ResultFilters'
import { ResultRow } from './ResultRow'
import { BrowserFallbackDialog } from './BrowserFallbackDialog'
import { filterRecords, orderRecords, type ResultOrder } from '../search/search-state'
import { FailureState } from '../../components/FailureState'
import { SourcePreviewDialog } from './SourcePreviewDialog'

const subjectRoleNames: Record<SearchSession['subject']['role'], string> = {
  brand: '品牌', 'brand-owner': '品牌权利人', 'store-operator': '店铺经营者', 'parent-company': '母公司',
  subsidiary: '子公司', affiliate: '关联公司', 'commissioning-party': '委托方', manufacturer: '生产企业',
  'contract-manufacturer': '代工厂', distributor: '经销商', 'platform-operator': '平台经营者', unknown: '未确认'
}

export function ResultsPage({ session, onNewSearch, onHistory }: { session: SearchSession; onNewSearch?: () => void; onHistory?(): void }) {
  const [order, setOrder] = useState<ResultOrder>('relevance')
  const [selectedTypes, setSelectedTypes] = useState<SourceType[]>([])
  const [selected, setSelected] = useState<SourceRecord>()
  const [preview, setPreview] = useState<BrowserFallbackPreview>()
  const [previewError, setPreviewError] = useState('')
  const [sourcePreview, setSourcePreview] = useState<SourcePreview>()
  const listRef = useRef<HTMLDivElement>(null)
  const scrollPosition = useRef(0)
  const allConnectorsFailed = session.connectorRuns.length > 0 && session.connectorRuns.every(run => run.status === 'failed')
  const records = useMemo(() => filterRecords(orderRecords(session.records, order), selectedTypes), [session.records, order, selectedTypes])

  useLayoutEffect(() => {
    if (!selected && listRef.current) listRef.current.scrollTop = scrollPosition.current
  }, [selected])

  async function prepareBrowserFallback() {
    setPreviewError('')
    try {
      const reason = session.status === 'partial' ? '部分来源未能完成自动检索' : session.status === 'failed' ? '自动检索未能完成' : '你选择在浏览器中继续查找公开信息'
      setPreview(await laborApi.browser.preview('bing', reason, session.queries))
    } catch {
      setPreviewError('无法准备浏览器搜索预览，请稍后重试。')
    }
  }

  return <>
    <AppChrome onHistory={onHistory}><main className="results-shell results-page" aria-label="检索结果">
      <div className="results-heading"><div><p className="eyebrow">公开来源 · 最佳努力检索</p><h1>{session.subject.name} 的检索结果</h1><p className="results-summary">主体角色：{subjectRoleNames[session.subject.role]} · {session.subject.verification === 'verified' ? '主体已核验' : '主体尚未权威核验'}</p><p className="results-summary">找到 {session.records.length} 条公开来源，供你逐条核验。</p></div>{onNewSearch && <button className="button-secondary" type="button" onClick={onNewSearch}>新建检索</button>}</div>
      {(session.status === 'partial' || session.status === 'failed' || session.status === 'cancelled') && <p className="partial-status" role="status">{session.status === 'partial' ? '部分来源未能完成检索' : session.status === 'cancelled' ? '检索已取消，以下为已找到的来源' : '自动检索未能完成'}{session.connectorRuns.some(run => run.status === 'failed') && ' · 可尝试浏览器搜索'}</p>}
      {allConnectorsFailed && <FailureState kind={session.connectorRuns.some(run => run.message?.includes('网络连接失败')) ? 'offline' : 'connectors-failed'} onAction={() => { void prepareBrowserFallback() }} technicalDetails={session.connectorRuns.map(run => `${run.connectorId}: ${run.message ?? run.status}`).join('\n')} />}
      <div className="results-layout">
        <div className="results-list-panel" ref={listRef} hidden={Boolean(selected)}>
          <ResultFilters order={order} selected={selectedTypes} onOrder={setOrder} onSelected={setSelectedTypes} />
          {records.length ? <ol className="results-list">{records.map(record => <ResultRow key={record.id} record={record} onOpen={() => { scrollPosition.current = listRef.current?.scrollTop ?? 0; setSelected(record) }} />)}</ol> : session.records.length ? <EmptyState title="没有符合这些来源类型的记录" detail="调整来源筛选后，可以查看其他公开来源。" /> : allConnectorsFailed ? <p className="quiet-copy">当前自动来源没有返回可显示的记录。</p> : <FailureState kind="no-results" onAction={() => { if (onNewSearch) onNewSearch(); else setPreview(undefined) }} />}
        </div>
        {selected && <ResultDetail session={session} record={selected} onBack={() => setSelected(undefined)} onOpenRelated={record => setSelected(record)} onPreviewSource={async () => {
          try { setSourcePreview(await laborApi.browser.previewSource(session.id, selected.id)) }
          catch { setPreviewError('无法准备原文确认预览，请稍后重试。') }
        }} />}
      </div>
      <div className="results-footer-actions"><button className="text-action" type="button" onClick={() => { void prepareBrowserFallback() }}>在浏览器中继续搜索</button>{previewError && <span className="field-error" role="alert">{previewError}</span>}</div>
    </main></AppChrome>
    {preview && <BrowserFallbackDialog preview={preview} onCancel={() => setPreview(undefined)} onConfirm={async () => {
      const result = await laborApi.browser.openConfirmed(preview.previewId)
      if (result.ok) setPreview(undefined)
      return result
    }} />}
    {sourcePreview && <SourcePreviewDialog preview={sourcePreview} onCancel={() => setSourcePreview(undefined)} onConfirm={async () => {
      const result = await laborApi.browser.openSourceConfirmed(sourcePreview.previewId)
      if (result.ok) setSourcePreview(undefined)
      return result
    }} />}
  </>
}
