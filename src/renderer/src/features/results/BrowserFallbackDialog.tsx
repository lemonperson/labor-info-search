import { useEffect, useRef, useState } from 'react'
import type { BrowserFallbackPreview } from '../../../../shared/types'

export function BrowserFallbackDialog({ preview, onCancel, onConfirm }: {
  preview: BrowserFallbackPreview; onCancel: () => void; onConfirm: () => Promise<{ ok: boolean }>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelButtonRef.current?.focus()
    function trapFocus(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter(element => element.getClientRects().length > 0)
      if (!focusable.length) {
        event.preventDefault()
        dialog?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const current = document.activeElement
      if (event.shiftKey && (current === first || !dialog?.contains(current))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (current === last || !dialog?.contains(current))) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => {
      document.removeEventListener('keydown', trapFocus)
      previousFocus?.focus()
    }
  }, [])
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
    <section ref={dialogRef} className="confirm-dialog browser-dialog" role="dialog" aria-modal="true" aria-labelledby="browser-dialog-title" tabIndex={-1}>
      <p className="section-kicker">离开应用继续搜索</p><h2 id="browser-dialog-title">在浏览器中打开此检索词？</h2>
      <p className="dialog-intro">{preview.reason}</p>
      <dl className="browser-preview-facts"><div><dt>搜索服务</dt><dd>{preview.provider === 'bing' ? 'Bing' : preview.provider}</dd></div><div><dt>访问域名</dt><dd>{preview.hostname}</dd></div></dl>
      <div className="browser-query-list"><strong>将提交的检索词</strong><ol>{preview.queries.map((query, index) => <li key={index}><code>{query}</code></li>)}</ol></div>
      <p className="privacy-copy">本次只会打开上方显示的这一条检索词，其他检索词不会随本次打开。搜索词会发送给 Bing；该服务可能按自身政策处理这些内容。应用不会把你的主体确认信息或本地记录发送给浏览器。</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="dialog-actions"><button ref={cancelButtonRef} type="button" className="button-secondary" onClick={onCancel}>取消</button><button type="button" className="button-primary" disabled={busy} onClick={() => { void confirm() }}>{busy ? '正在打开…' : '确认并打开浏览器'}</button></div>
    </section>
  </div>
}
