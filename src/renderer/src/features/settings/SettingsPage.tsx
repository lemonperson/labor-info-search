import type { AppSettings } from '../../../../shared/types'
import { AppChrome } from '../../components/AppChrome'
import { TechnicalDetails } from '../../components/TechnicalDetails'

export function SettingsPage({ settings, onSaveHistoryChange, onHistory, onIntake, error }: {
  settings: AppSettings; onSaveHistoryChange(value: boolean): void; onHistory?(): void; onIntake?(): void; error?: string
}) {
  const tech = `本机历史记录：${settings.saveHistory ? '开启' : '关闭'}\n搜索服务：${settings.browserProvider}\n界面外观：${settings.theme}`
  return <AppChrome onIntake={onIntake} onHistory={onHistory}>
    <main className="settings-shell" aria-label="设置">
      <p className="eyebrow">本机偏好</p><h1>设置</h1>
      <section className="settings-section" aria-labelledby="history-setting-title">
        <label className="setting-toggle" htmlFor="save-history">
          <input id="save-history" type="checkbox" checked={settings.saveHistory} onChange={event => onSaveHistoryChange(event.target.checked)} />
          <span><strong id="history-setting-title">保存本机检索历史</strong><small>仅保留在这台设备上，可随时删除或清空。</small></span>
        </label>
        {!settings.saveHistory && <p className="quiet-copy">历史保存已关闭。之后的检索不会写入历史记录。</p>}
      </section>
      {error && <p className="field-error" role="alert">{error}</p>}
      <TechnicalDetails value={tech} />
      <p className="quiet-copy">这些信息可以复制给支持人员，帮助说明当前偏好设置。</p>
    </main>
  </AppChrome>
}
