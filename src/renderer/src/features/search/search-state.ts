import type { SearchSession, SessionProgress, SourceRecord, SourceType } from '../../../../shared/types'

export type ResultOrder = 'relevance' | 'time'

export function orderRecords(records: SourceRecord[], order: ResultOrder): SourceRecord[] {
  return [...records].sort((left, right) => {
    if (order === 'relevance') {
      const evidence = right.matchEvidence.length - left.matchEvidence.length
      if (evidence) return evidence
    }
    const date = (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '')
    return date || left.title.localeCompare(right.title, 'zh-CN')
  })
}

export function filterRecords(records: SourceRecord[], selected: SourceType[]): SourceRecord[] {
  return selected.length ? records.filter(record => selected.includes(record.sourceType)) : records
}

export function progressLabel(progress: SessionProgress | undefined, session?: SearchSession): string {
  if (!progress) return '正在准备检索…'
  const labels: Record<SessionProgress['phase'], string> = {
    preparing_queries: '正在整理检索词', searching: '正在查询公开来源', normalizing: '正在核对来源信息',
    saving: '正在整理结果', complete: '检索已完成'
  }
  const runCount = session?.connectorRuns.length ?? 0
  return runCount ? labels[progress.phase] + ' · ' + runCount + ' 个来源' : labels[progress.phase]
}
