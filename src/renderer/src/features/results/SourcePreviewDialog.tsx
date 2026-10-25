import { useState } from 'react'
import type { SourcePreview } from '../../../../shared/types'

export function SourcePreviewDialog({ preview, onCancel, onConfirm }: { preview: SourcePreview; onCancel: () => void; onConfirm: () => Promise<{ ok: boolean }> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      const result = await onConfirm()
      if (!result.ok) setError('确认信息已失效或浏览器无法打开，请重新生成预览。')
    } catch { setError('浏览器暂时无法打开，请稍后重试。') }
    finally { setBusy(false) }
  }
  return <div className="dialog-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="source-preview-title">
    <p className="section-kicker">离开应用核验原文</p><h2 id="source-preview-title">打开原文前确认</h2>
    <p className="dialog-intro">来源网页由外部网站提供，页面内容不会被应用执行。</p>
    <dl className="browser-preview-facts"><div><dt>来源域名</dt><dd>{preview.hostname}</dd></div><div><dt>原文标题</dt><dd>{preview.title}</dd></div><div><dt>完整目标地址</dt><dd><code>{preview.url}</code></dd></div></dl>
    {error && <p role="alert" className="field-error">{error}</p>}
    <div className="dialog-actions"><button type="button" className="button-secondary" onClick={onCancel}>取消</button><button type="button" className="button-primary" disabled={busy} onClick={() => { void confirm() }}>{busy ? '正在打开…' : '确认并打开原文'}</button></div>
  </section></div>
}
