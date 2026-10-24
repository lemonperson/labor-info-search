import { useEffect, useRef, type KeyboardEvent, type PropsWithChildren } from 'react'

type Props = PropsWithChildren<{ title: string; onClose(): void }>

export function ConfirmDialog({ title, onClose, children }: Props) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const focusable = panel.current?.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]:not([tabindex="-1"])')
    focusable?.focus()
    return () => previousFocus?.focus()
  }, [])
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab' || !panel.current) return
    const focusable = [...panel.current.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) {
      event.preventDefault(); first.focus()
    }
  }
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={panel} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" onKeyDown={handleKeyDown}>
      <button className="dialog-close" type="button" aria-label="关闭主体确认" onClick={onClose}>×</button>
      <p className="section-kicker">检索前确认</p>
      <h2 id="dialog-title">{title}</h2>
      {children}
    </section>
  </div>
}
