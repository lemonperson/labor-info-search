import type { SearchSession } from '../../../../shared/types'

export function HistoryRow({ session, onOpen, onDelete }: { session: SearchSession; onOpen(): void; onDelete(): void }) {
  return <li className="history-row">
    <button type="button" className="history-row-open" onClick={onOpen}>
      <strong>{session.subject.name}</strong>
      <span>{new Date(session.startedAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      <span>{session.records.length} 条公开来源 · {session.inputType === 'screenshot' ? '截图文字' : session.inputType === 'product-link' ? '商品链接' : '企业名称'}</span>
    </button>
    <button type="button" className="text-action history-row-delete" aria-label="删除这条记录" onClick={onDelete}>删除</button>
  </li>
}
