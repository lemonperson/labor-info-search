import type { DeduplicationResult, SourceRecord } from '../../shared/types'
import { canonicalizeUrl } from './normalize-result'

function compareTimestamps(left: string, right: string): number {
  const timeDifference = Date.parse(left) - Date.parse(right)
  return timeDifference || left.localeCompare(right)
}

/** Merge URL-identical records while retaining full query/connector audit provenance. */
export function deduplicateRecords(records: SourceRecord[]): DeduplicationResult {
  const grouped = new Map<string, SourceRecord[]>()
  for (const record of records) {
    const key = canonicalizeUrl(record.canonicalUrl ?? record.url)
    const group = grouped.get(key) ?? []
    group.push(record)
    grouped.set(key, group)
  }
  const normalizedGroups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
  const mergedGroups: Array<{ key: string; records: SourceRecord[] }> = normalizedGroups.map(([key, group]) => ({
    key,
    records: [...group].sort((a, b) => compareTimestamps(a.accessedAt, b.accessedAt) || a.id.localeCompare(b.id))
  }))
  const merged: SourceRecord[] = []
  const duplicates: DeduplicationResult['duplicates'] = []
  for (const { key, records: group } of mergedGroups) {
    const first = group[0]
    const allIds = [...new Set(group.map(({ id }) => id))].sort()
    const queryIds = [...new Set(group.flatMap(({ queryIds = [] }) => queryIds))].sort()
    const connectorIds = [...new Set(group.flatMap(({ connectorIds = [] }) => connectorIds))].sort()
    const matchEvidence = [...new Set(group.flatMap(({ matchEvidence: evidence }) => evidence))].sort()
    merged.push({ ...first, canonicalUrl: key,
      accessedAt: group.map(({ accessedAt }) => accessedAt).sort(compareTimestamps)[0],
      latestAccessedAt: group.flatMap(({ latestAccessedAt, accessedAt }) => [accessedAt, ...(latestAccessedAt ? [latestAccessedAt] : [])]).sort(compareTimestamps).at(-1)!,
      queryIds, connectorIds, matchEvidence,
      ...(allIds.length > 1 ? { relatedRecordIds: allIds.filter((id) => id !== first.id) } : {})
    })
    if (allIds.length > 1) duplicates.push({ retainedId: first.id, mergedIds: allIds.filter((id) => id !== first.id) })
  }
  return { records: merged, duplicates }
}
