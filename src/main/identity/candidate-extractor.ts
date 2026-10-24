import { createHash } from 'node:crypto'
import { entityCandidateSchema } from '../../shared/schemas'
import type { EntityCandidate, SubjectRole } from '../../shared/types'

const labels: Array<{ label: string; role: SubjectRole }> = [
  { label: '品牌', role: 'brand' },
  { label: '生产企业', role: 'manufacturer' },
  { label: '制造商', role: 'manufacturer' },
  { label: '委托方', role: 'commissioning-party' },
  { label: '经销商', role: 'distributor' }
]
const labelPattern = labels.map(({ label }) => label).join('|')
const nextLabel = new RegExp(`(?:${labelPattern})\\s*[:：]`, 'u')

function normalizeName(value: string): string {
  return value
    .replace(/[：:|｜]/gu, ' ')
    .replace(/(?<=[\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s，,。；;、\-—]+|[\s，,。；;、\-—]+$/gu, '')
    .trim()
}

export function extractEntityCandidates(text: string): EntityCandidate[] {
  const found = new Map<string, { name: string; role: SubjectRole; evidence: Set<string> }>()
  const linePattern = new RegExp(`(${labelPattern})\\s*[:：]\\s*([^\\r\\n]*)`, 'gu')

  for (const line of text.split(/\r?\n/u)) {
    const searchableLine = line.replace(/(?<=[\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '')
    for (const match of searchableLine.matchAll(linePattern)) {
      const label = match[1]
      const role = labels.find((entry) => entry.label === label)?.role
      if (!role || match.index === undefined) continue

      const valueStart = match.index + match[0].length - match[2].length
      const remainder = searchableLine.slice(valueStart)
      const followingLabel = nextLabel.exec(remainder)
      const name = normalizeName(followingLabel ? remainder.slice(0, followingLabel.index) : remainder)
      if (!name || name.length > 120) continue

      const key = `${role}\u0000${name.toLocaleLowerCase()}`
      const existing = found.get(key)
      if (existing) existing.evidence.add(line.trim())
      else found.set(key, { name, role, evidence: new Set([line.trim()]) })
    }
  }

  return [...found.values()].map(({ name, role, evidence }) => entityCandidateSchema.parse({
    id: `ocr-${role}-${createHash('sha256').update(name.toLocaleLowerCase()).digest('hex').slice(0, 16)}`,
    name,
    role,
    evidence: [...evidence]
  }))
}
