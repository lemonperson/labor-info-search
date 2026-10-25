import { createHash } from 'node:crypto'
import type { EventGroup, SourceRecord } from '../../shared/types'

const STOP = new Set(['报道', '情况', '信息', '后续', '公司', '劳动', '相关', '表示', '员工', '内容', '说明'])
const EVENT_TERMS = ['劳动仲裁', '劳动争议', '欠薪', '工资拖欠', '工资', '违法解除', '裁员', '加班', '工时', '社保', '工伤', '劳动保障监察', '行政处罚', '员工待遇']

function titleTerms(title: string): Set<string> {
  const terms = new Set<string>()
  for (const match of title.toLocaleLowerCase().matchAll(/[\p{Script=Han}]{2,}|[a-z0-9]{3,}/gu)) {
    const term = match[0]
    if (!STOP.has(term)) terms.add(term)
    // Adjacent Chinese bigrams make small wording changes comparable without sentiment.
    if (/^[\p{Script=Han}]{4,}$/u.test(term)) for (let i = 0; i <= term.length - 2; i++) {
      const bigram = term.slice(i, i + 2)
      if (!STOP.has(bigram)) terms.add(bigram)
    }
  }
  return terms
}

function dateOf(record: SourceRecord): number | undefined {
  const value = record.publishedAt ?? record.accessedAt
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Return cautious, auditable event-clustering suggestions; a group is never a factual assertion. */
export function groupRelatedEvents(records: SourceRecord[]): EventGroup[] {
  const ordered = [...records].sort((a, b) => a.id.localeCompare(b.id))
  const parent = ordered.map((_, index) => index)
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]))
  const union = (a: number, b: number) => { const left = find(a), right = find(b); if (left !== right) parent[Math.max(left, right)] = Math.min(left, right) }
  const titleEvidence = ordered.map(({ title }) => titleTerms(title))
  const contentEvidence = ordered.map(({ title, excerpt }) => titleTerms(`${title} ${excerpt ?? ''}`))
  const evidenceByRecord = contentEvidence
  for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
    const left = ordered[i], right = ordered[j]
    if (left.subjectId !== right.subjectId) continue
    const leftDate = dateOf(left), rightDate = dateOf(right)
    if (leftDate === undefined || rightDate === undefined || Math.abs(leftDate - rightDate) > 14 * 24 * 60 * 60 * 1000) continue
    const sharedTitle = [...titleEvidence[i]].filter((term) => titleEvidence[j].has(term) && !STOP.has(term))
    const sharedContent = [...contentEvidence[i]].filter((term) => contentEvidence[j].has(term) && !STOP.has(term))
    const sharedEventTerm = EVENT_TERMS.find((term) =>
      left.title.includes(term) && right.title.includes(term) ||
      term !== '劳动争议' && Boolean(left.excerpt?.includes(term) && right.excerpt?.includes(term)))
    if (sharedTitle.length > 0 && sharedContent.length > 0 && sharedEventTerm) union(i, j)
  }
  const clusters = new Map<number, number[]>()
  ordered.forEach((_, index) => { const root = find(index), cluster = clusters.get(root) ?? []; cluster.push(index); clusters.set(root, cluster) })
  return [...clusters.values()].filter((cluster) => cluster.length > 1).map((cluster) => {
    const members = cluster.map((index) => ordered[index])
    const common = [...evidenceByRecord[cluster[0]]].filter((term) => cluster.every((index) => evidenceByRecord[index].has(term))).sort()
    return {
      id: `event-${createHash('sha256').update(`${members[0].subjectId}:${members.map(({ id }) => id).join(',')}`).digest('hex').slice(0, 16)}`,
      subjectId: members[0].subjectId,
      title: members[0].title,
      recordIds: members.map(({ id }) => id),
      status: 'suggested' as const,
      matchEvidence: common.length ? [`标题和摘录共同提及：${common.slice(0, 6).join('、')}；日期相近，仅供人工复核`] : ['标题和日期相近；仅供人工复核']
    }
  }).sort((a, b) => a.recordIds[0].localeCompare(b.recordIds[0]))
}
