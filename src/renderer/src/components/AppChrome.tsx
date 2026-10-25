import type { PropsWithChildren } from 'react'

type Props = PropsWithChildren<{ onIntake?(): void; onHistory?(): void; onSettings?(): void }>

export function AppChrome({ children, onIntake, onHistory, onSettings }: Props) {
  return <div className="app-frame">
    <header className="app-topbar">
      <div className="app-wordmark"><span aria-hidden="true" className="app-mark"><i /></span><span>劳动信息检索</span></div>
      <span className="app-topnote">公开信息 · 来源可核验</span>
      {(onIntake || onHistory || onSettings) && <nav className="app-navigation" aria-label="应用导航">
        {onIntake && <button type="button" className="text-action" onClick={onIntake}>开始检索</button>}
        {onHistory && <button type="button" className="text-action" onClick={onHistory}>历史</button>}
        {onSettings && <button type="button" className="text-action" onClick={onSettings}>设置</button>}
      </nav>}
    </header>
    {children}
    <footer className="app-footer">只整理公开信息，不评分，也不替你作出购买决定。</footer>
  </div>
}
