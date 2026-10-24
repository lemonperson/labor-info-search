import type { SessionProgress } from '../../../../shared/types'
import { AppChrome } from '../../components/AppChrome'
import { progressLabel } from './search-state'

export function SearchProgress({ progress, onCancel }: { progress?: SessionProgress; onCancel?: () => void }) {
  return <AppChrome><main className="results-shell" aria-live="polite">
    <p className="eyebrow">公开信息检索</p><h1>正在整理可核验的来源</h1>
    <p className="intro-copy">{progressLabel(progress)}</p>
    <div className="search-progress-track"><span style={{ width: progress && progress.total > 0 ? Math.round(100 * progress.completed / progress.total) + '%' : '8%' }} /></div>
    <p className="quiet-copy">检索范围有限，未找到记录不代表不存在相关信息。</p>
    {onCancel && <button className="text-action" type="button" onClick={onCancel}>取消检索</button>}
  </main></AppChrome>
}
