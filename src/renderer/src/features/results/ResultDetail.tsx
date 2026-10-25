import type { SearchSession, SourceRecord } from '../../../../shared/types'
import { SourceBadge } from '../../components/SourceBadge'
import { FailureState } from '../../components/FailureState'

export function ResultDetail({ session, record, onBack, onOpenRelated, onPreviewSource }: {
  session: SearchSession; record: SourceRecord; onBack: () => void; onOpenRelated?: (record: SourceRecord) => void; onPreviewSource?: () => void
}) {
  const roleNames: Record<string, string> = { brand: '品牌', 'brand-owner': '品牌权利人', 'store-operator': '店铺经营者', 'parent-company': '母公司', subsidiary: '子公司', affiliate: '关联公司', 'commissioning-party': '委托方', manufacturer: '生产企业', 'contract-manufacturer': '代工厂', distributor: '经销商', 'platform-operator': '平台经营者', unknown: '未确认' }
  const ids = new Set(record.relatedRecordIds ?? [])
  for (const group of session.eventGroups) if (group.recordIds.includes(record.id)) for (const id of group.recordIds) if (id !== record.id) ids.add(id)
  const related = session.records.filter(item => ids.has(item.id))
  const hostname = new URL(record.url).hostname
  return <main className="result-detail results-shell" aria-label="来源详情">
    <button type="button" className="text-action back-to-results" onClick={onBack}>← 返回检索结果</button>
    <article className="detail-card">
      <div className="result-row-meta"><SourceBadge sourceType={record.sourceType} claimStatus={record.claimStatus} /><span>{record.publisher}</span></div>
      <h1>{record.title}</h1>
      <p className="detail-domain">来源域名：{hostname}</p>
      <p className="detail-original-url">原始链接：{record.url}</p>
      {onPreviewSource && <button type="button" className="text-action" onClick={onPreviewSource}>打开原文前确认</button>}
      <p className="detail-subject">主体角色：{roleNames[session.subject.role]} · {session.subject.verification === 'verified' ? '主体已核验' : '主体尚未权威核验'}</p>
      <p className="detail-date">发布时间：{record.publishedAt ?? '未提供'} · 检索时间：{record.accessedAt.slice(0, 10)}</p>
      {record.availability === 'unavailable' && <FailureState kind="source-unavailable" onAction={onBack} />}
      <section className="detail-section"><h2>与主体的匹配线索</h2><ul>{record.matchEvidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul></section>
      {record.excerpt && <section className="detail-section"><h2>来源摘录</h2><blockquote>{record.excerpt}</blockquote></section>}
      {related.length > 0 && <section className="detail-section"><h2>可能相关的来源（建议分组）</h2><p>自动关联仅供人工复核，不表示这些来源属于同一事件。</p>{session.eventGroups.filter(group => group.recordIds.includes(record.id)).map(group => <ul key={group.id}>{group.matchEvidence.map((item, index) => <li key={index}>{item}</li>)}</ul>)}<ul className="related-records">{related.map(item => <li key={item.id}><button type="button" onClick={() => onOpenRelated?.(item)}>{item.title}</button><span>{item.publisher} · {item.publishedAt ?? '日期未提供'}</span></li>)}</ul></section>}
    </article>
  </main>
}
