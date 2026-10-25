import { useState } from 'react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FailureState } from '../../components/FailureState'

export function FirstRunDisclosure({ saveHistory, onAccept, error }: {
  saveHistory: boolean; onAccept(saveHistory: boolean): void; error?: string
}) {
  const [historyEnabled, setHistoryEnabled] = useState(saveHistory)
  return <div className="first-run-shell">
    <ConfirmDialog title="本地保存与网络检索说明" kicker="首次使用" showCloseButton={false} onClose={() => {}}>
      <p className="dialog-intro">开始前请了解这些信息。确认后，你仍可以在设置中随时调整历史记录。</p>
      <ul className="disclosure-list">
        <li>搜索词会发送给公开来源服务，用于查找可核验的信息。</li>
        <li>检索历史默认只保存在这台设备上，可在应用内删除或关闭保存。</li>
        <li>截图只在本机识别；截图文件和路径不会保存，也不会随历史记录保留。</li>
        <li>只有你确认主体并提交检索后，才会开始公开来源搜索。</li>
      </ul>
      <label className="setting-toggle"><input type="checkbox" checked={historyEnabled} onChange={event => setHistoryEnabled(event.target.checked)} /><span><strong>保存本机检索历史</strong><small>默认开启，你可以稍后在设置中关闭。</small></span></label>
      {error && <FailureState kind="database-recovery" technicalDetails={error} />}
      <div className="dialog-actions"><button type="button" className="button-primary" onClick={() => onAccept(historyEnabled)}>我已了解，继续</button></div>
    </ConfirmDialog>
  </div>
}
