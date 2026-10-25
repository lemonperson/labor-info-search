import type { ReactNode } from 'react'
import { TechnicalDetails } from './TechnicalDetails'

export type FailureKind = 'offline' | 'no-results' | 'link-blocked' | 'ocr-low-confidence' | 'source-unavailable' | 'connectors-failed' | 'database-recovery'

const copy: Record<FailureKind, { title: string; detail: string; action: string }> = {
  offline: { title: '网络暂时不可用', detail: '这次没有完成公开来源检索。检查网络连接后可以再试。', action: '检查网络连接' },
  'no-results': { title: '暂时没有找到公开来源', detail: '检索结果有限，不代表不存在相关信息。你可以调整主体名称或稍后再试。', action: '调整主体名称' },
  'link-blocked': { title: '商品页暂时无法读取', detail: '页面可能需要登录，或网站暂时限制了访问。', action: '手动输入企业名称' },
  'ocr-low-confidence': { title: '截图文字识别不够清晰', detail: '请核对并编辑识别出的文字，也可以手动输入企业名称。', action: '编辑识别文字' },
  'source-unavailable': { title: '这个来源暂时无法打开', detail: '页面可能已删除或暂时无法访问；保留的摘录来自检索时记录。', action: '返回检索结果' },
  'connectors-failed': { title: '所有自动来源都未能完成检索', detail: '当前来源可能暂时不可访问。你可以在浏览器中查看公开信息。', action: '在浏览器中继续搜索' },
  'database-recovery': { title: '本机记录暂时无法读取', detail: '你的设置和历史记录仍保存在本机。重新打开应用后可以再次尝试。', action: '重新打开应用' }
}

export function FailureState({ kind, onAction, technicalDetails, children, announcementRole = 'status' }: {
  kind: FailureKind; onAction?: () => void; technicalDetails?: string; children?: ReactNode; announcementRole?: 'status' | 'alert'
}) {
  const item = copy[kind]
  return <section className={`failure-state failure-state-${kind}`} role={announcementRole} aria-labelledby={`failure-${kind}`}>
    <span className="failure-symbol" aria-hidden="true">!</span>
    <div className="failure-copy">
      <h2 id={`failure-${kind}`}>{item.title}</h2>
      <p>{children ?? item.detail}</p>
      {onAction && <button type="button" className="text-action" onClick={onAction}>{item.action}</button>}
      {technicalDetails && <TechnicalDetails value={technicalDetails} />}
    </div>
  </section>
}
