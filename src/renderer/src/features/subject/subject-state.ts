import type { CompanySubject, EntityCandidate, SubjectRole } from '../../../../shared/types'

export type SubjectOrigin = 'company-name' | 'product-link' | 'screenshot'
export type ConfirmedSubjectInput = {
  subject: CompanySubject
  selectedEvidence: string[]
  verification: 'verified' | 'user-confirmed' | 'unverified'
  origin: SubjectOrigin
}

export const roleLabels: Record<SubjectRole, string> = {
  brand: '品牌', 'brand-owner': '品牌所有方', 'store-operator': '店铺经营者', 'parent-company': '母公司',
  subsidiary: '子公司', affiliate: '关联公司', 'commissioning-party': '委托方', manufacturer: '生产企业',
  'contract-manufacturer': '受托生产企业', distributor: '经销商', 'platform-operator': '平台经营者', unknown: '待确认关系'
}

export function subjectCandidate(role: SubjectRole, name: string, ...evidence: string[]): EntityCandidate {
  return { id: `${role}:${name.trim().toLocaleLowerCase()}`, name: name.trim(), role, evidence: evidence.filter(Boolean) }
}

export function candidatesFromLabelledText(text: string): EntityCandidate[] {
  const roles: Record<string, SubjectRole> = {
    品牌: 'brand', 品牌名称: 'brand', 生产企业: 'manufacturer', 生产厂家: 'manufacturer', 生产商: 'manufacturer', 制造商: 'manufacturer',
    委托方: 'commissioning-party', 委托企业: 'commissioning-party', 经销商: 'distributor', 经销企业: 'distributor'
  }
  const labelPattern = /(品牌名称|品牌|生产企业|生产厂家|生产商|制造商|委托企业|委托方|经销企业|经销商)\s*[:：]\s*/gu
  const candidates = new Map<string, EntityCandidate>()
  for (const sourceLine of text.split(/\r?\n/u)) {
    const normalized = sourceLine.replace(/(?<=[\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '').replace(/\s*[:：]\s*/gu, '：').trim()
    const matches = [...normalized.matchAll(labelPattern)]
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index]
      const nameStart = (match.index ?? 0) + match[0].length
      const nameEnd = matches[index + 1]?.index ?? normalized.length
      const name = normalized.slice(nameStart, nameEnd).replace(/^[\s，,。；;、\-—]+|[\s，,。；;、\-—]+$/gu, '').trim()
      if (!name || name.length > 120) continue
      const candidate = subjectCandidate(roles[match[1]], name, sourceLine.trim())
      const existing = candidates.get(candidate.id)
      if (existing) existing.evidence.push(sourceLine.trim())
      else candidates.set(candidate.id, candidate)
    }
  }
  return [...candidates.values()]
}

export function confirmSubject(candidates: EntityCandidate[], selectedId: string | undefined, origin: SubjectOrigin, editedName?: string, editedRole?: SubjectRole): ConfirmedSubjectInput | undefined {
  if (!selectedId) return undefined
  const candidate = candidates.find(({ id }) => id === selectedId)
  const name = editedName === undefined ? candidate?.name : editedName.trim()
  if (!candidate || !name?.trim()) return undefined
  const selected = { ...candidate, name, role: editedRole ?? candidate.role }
  return {
    subject: { ...selected, verification: 'user-confirmed' },
    selectedEvidence: selected.evidence,
    verification: 'user-confirmed',
    origin
  }
}
