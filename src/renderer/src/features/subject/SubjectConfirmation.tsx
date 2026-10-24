import { useMemo, useState } from 'react'
import type { EntityCandidate, SubjectRole } from '../../../../shared/types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { confirmSubject, roleLabels, type ConfirmedSubjectInput, type SubjectOrigin } from './subject-state'

function readableEvidence(value: string): string {
  return value.replace(/(?<=[\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, '').replace(/\s*[:：]\s*/gu, '：')
}

type Props = {
  candidates: EntityCandidate[]
  origin: SubjectOrigin
  onConfirm(value: ConfirmedSubjectInput): void
  onClose?(): void
}

export function SubjectConfirmation({ candidates, origin, onConfirm, onClose = () => {} }: Props) {
  const initial = candidates.length === 1 ? candidates[0].id : ''
  const [selectedId, setSelectedId] = useState(initial)
  const selected = useMemo(() => candidates.find(candidate => candidate.id === selectedId), [candidates, selectedId])
  const [editedName, setEditedName] = useState('')
  const [nameWasEdited, setNameWasEdited] = useState(false)
  const [editedRole, setEditedRole] = useState<SubjectRole | undefined>()
  const [error, setError] = useState('')

  return <ConfirmDialog title="选择检索主体" onClose={onClose}>
    <p className="dialog-intro">品牌、店铺和生产企业可能不是同一家公司。请确认要检索的具体主体。</p>
    {candidates.length > 0 ? <fieldset className="candidate-list">
      <legend>候选主体</legend>
      {candidates.map(candidate => <label className={`candidate-option ${selectedId === candidate.id ? 'is-selected' : ''}`} key={candidate.id}>
        <input type="radio" name="subject-candidate" value={candidate.id} checked={selectedId === candidate.id} onChange={() => { setSelectedId(candidate.id); setEditedName(''); setNameWasEdited(false); setEditedRole(undefined); setError('') }} />
        <span className="candidate-copy"><strong>{candidate.name}</strong><span className="role-pill">{roleLabels[candidate.role]}</span>
          {candidate.evidence.length > 0 && <span className="candidate-evidence">{candidate.evidence.map(readableEvidence).join('；')}</span>}
        </span>
      </label>)}
    </fieldset> : <p role="status" className="inline-note">没有找到可直接选择的主体，请补充企业名称。</p>}
    {selected && <div className="edit-subject">
      <label htmlFor="subject-name">企业或品牌名称</label>
      <input id="subject-name" value={nameWasEdited ? editedName : selected.name} maxLength={120} onChange={event => { setNameWasEdited(true); setEditedName(event.target.value) }} />
      <label htmlFor="subject-role">与该主体的关系</label>
      <select id="subject-role" value={editedRole ?? selected.role} onChange={event => setEditedRole(event.target.value as SubjectRole)}>
        {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>}
    <p className="verification-note">主体尚未权威核验。检索结果会按你确认的主体名称整理。</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      <button type="button" className="button-secondary" onClick={onClose}>返回修改</button>
      <button type="button" className="button-primary" disabled={!selected} onClick={() => {
        const confirmed = confirmSubject(candidates, selectedId || undefined, origin, nameWasEdited ? editedName : undefined, editedRole)
        if (!confirmed) { setError('请选择一个检索主体并确认名称。'); return }
        if (!confirmed.subject.name.trim()) { setError('请输入企业或品牌名称。'); return }
        onConfirm(confirmed)
      }}>确认主体</button>
    </div>
  </ConfirmDialog>
}
