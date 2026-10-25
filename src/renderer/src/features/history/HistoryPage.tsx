import { useState } from 'react'
import type { SearchSession } from '../../../../shared/types'
import { AppChrome } from '../../components/AppChrome'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { EmptyState } from '../../components/EmptyState'
import { FailureState } from '../../components/FailureState'
import { HistoryRow } from './HistoryRow'

export function HistoryPage({ sessions, onOpen, onDelete, onClear, onSettings, onIntake, saveHistory = true, error }: {
  sessions: SearchSession[]; onOpen(session: SearchSession): void; onDelete(id: string): void; onClear(): void; onSettings?(): void; onIntake?(): void; saveHistory?: boolean; error?: string
}) {
  const [confirmClear, setConfirmClear] = useState(false)
  return <>
    <AppChrome onIntake={onIntake} onSettings={onSettings}>
      <main className="history-shell" aria-label="检索历史">
        <div className="history-heading"><div><p className="eyebrow">只在这台设备</p><h1>检索历史</h1><p className="results-summary">本机保存的检索记录仅供你查看。</p></div>
          <button type="button" className="text-action" disabled={sessions.length === 0} onClick={() => setConfirmClear(true)}>清空历史记录</button>
        </div>
        {!saveHistory && <p className="history-off-note" role="status">已关闭历史记录保存。之后的检索不会写入历史记录。</p>}
        {error ? <FailureState kind="database-recovery" onAction={() => window.location.reload()} technicalDetails={error} />
          : sessions.length ? <ol className="history-list">{sessions.map(session => <HistoryRow key={session.id} session={session} onOpen={() => onOpen(session)} onDelete={() => onDelete(session.id)} />)}</ol>
          : <EmptyState title="还没有本机检索记录" detail="完成检索后，记录会显示在这里。你也可以随时在设置中关闭历史记录。" />}
      </main>
    </AppChrome>
    {confirmClear && <ConfirmDialog title="清空所有历史记录？" kicker="本机历史" closeLabel="关闭清空确认" onClose={() => setConfirmClear(false)}>
      <p className="dialog-intro">清空后无法恢复。你的其他设置会保留。</p>
      <div className="dialog-actions"><button type="button" className="button-secondary" onClick={() => setConfirmClear(false)}>取消</button><button type="button" className="button-primary" onClick={() => { onClear(); setConfirmClear(false) }}>清空历史记录</button></div>
    </ConfirmDialog>}
  </>
}
