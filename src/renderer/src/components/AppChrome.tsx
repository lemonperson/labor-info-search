import type { PropsWithChildren } from 'react'

export function AppChrome({ children }: PropsWithChildren) {
  return <div className="app-frame">
    <header className="app-topbar">
      <div className="app-wordmark"><span aria-hidden="true" className="app-mark"><i /></span><span>劳动信息检索</span></div>
      <span className="app-topnote">公开信息 · 来源可核验</span>
    </header>
    {children}
    <footer className="app-footer">只整理公开信息，不评分，也不替你作出购买决定。</footer>
  </div>
}
