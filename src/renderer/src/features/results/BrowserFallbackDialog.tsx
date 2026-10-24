import { useState } from 'react'
import type { BrowserFallbackPreview } from '../../../../shared/types'

export function BrowserFallbackDialog({ preview, onCancel, onConfirm }: {
  preview: BrowserFallbackPreview; onCancel: () => void; onConfirm: () => Promise<{ ok: boolean }>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await onConfirm()
      if (!result.ok) setError('确认信息已失效或浏览器无法打开，请重新生成预览。')
    } catch {
      setError('浏览器暂时无法打开，请稍后重试。')
    } finally { setBusy(false) }
  }
  return <div className="dialog-backdrop" role="presentation">
    <section className="confirm-dialog browser-dialog" role="dialog" aria-modal="true" aria-labelledby="browser-dialog-title">
      <p className="section-kicker">离开应用继续搜索</p><h2 id="browser-dialog-title">在浏览器中打开这些检索词？</h2>
      <p className="dialog-intro">{preview.reason}</p>
      <dl className="browser-preview-facts"><div><dt>搜索服务</dt><dd>{preview.provider === 'bing' ? 'Bing' : preview.provider}</dd></div><div><dt>访问域名</dt><dd>{preview.hostname}</dd></div></dl>
      <div className="browser-query-list"><strong>将提交的检索词</strong><ol>{preview.queries.map((query, index) => <li key={index}><code>{query}</code></li>)}</ol></div>
      <p className="privacy-copy">搜索词会发送给 Bing；该服务可能按自身政策处理这些内容。应用不会把你的主体确认信息或本地记录发送给浏览器。</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button-secondary" disabled={busy} onClick={onCancel}>取消</button><button type="button" className="button-primary" disabled={busy} onClick={() => { void confirm() }}>{busy ? '正在打开…' : '确认并打开浏览器'}</button></div>
    </section>
  </div>
}
