import type { SourceType } from '../../../../shared/types'
import type { ResultOrder } from '../search/search-state'

const sources: Array<[SourceType, string]> = [
  ['government', '政府与监管'], ['court-arbitration', '法院与仲裁'], ['media', '媒体'],
  ['company-response', '企业回应'], ['employee-statement', '劳动者陈述'], ['other', '其他来源']
]

export function ResultFilters({ order, selected, onOrder, onSelected }: {
  order: ResultOrder; selected: SourceType[]; onOrder(value: ResultOrder): void; onSelected(value: SourceType[]): void
}) {
  return <div className="result-controls">
    <label>排序<select aria-label="结果排序" value={order} onChange={event => onOrder(event.target.value as ResultOrder)}><option value="relevance">相关度</option><option value="time">时间</option></select></label>
    <fieldset className="source-filters"><legend>按来源类型筛选</legend>
      {sources.map(([value, label]) => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={event => onSelected(event.target.checked ? [...selected, value] : selected.filter(item => item !== value))} />{label}</label>)}
    </fieldset>
  </div>
}
