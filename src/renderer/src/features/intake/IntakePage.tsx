import { useEffect, useRef, useState } from 'react'
import type { EntityCandidate } from '../../../../shared/types'
import { laborApi } from '../../api/labor-api'
import { AppChrome } from '../../components/AppChrome'
import { SegmentedInput } from '../../components/SegmentedInput'
import { SubjectConfirmation } from '../subject/SubjectConfirmation'
import { candidatesFromLabelledText, subjectCandidate, type ConfirmedSubjectInput, type SubjectOrigin } from '../subject/subject-state'
import { validateIntake, type IntakeMode } from './intake-state'
import { FailureState, type FailureKind } from '../../components/FailureState'

type Props = { onConfirmed?(value: ConfirmedSubjectInput): void; onHistory?(): void; onSettings?(): void }
type Busy = 'resolving-link' | 'recognizing-image' | undefined

const modeNames: Record<IntakeMode, string> = { 'company-name': '企业名称', 'product-link': '商品链接', screenshot: '截图文字' }

export function IntakePage({ onConfirmed, onHistory, onSettings }: Props) {
  const [mode, setMode] = useState<IntakeMode>('company-name')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<Busy>()
  const [progress, setProgress] = useState('')
  const [candidates, setCandidates] = useState<EntityCandidate[]>([])
  const [origin, setOrigin] = useState<SubjectOrigin>('company-name')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [confirmed, setConfirmed] = useState<ConfirmedSubjectInput>()
  const [outcome, setOutcome] = useState('')
  const [failure, setFailure] = useState<FailureKind>()
  const requestId = useRef(0)

  useEffect(() => mode === 'screenshot' ? laborApi.image.onProgress(({ status }) => setProgress(status)) : undefined, [mode])

  function switchMode(next: IntakeMode) {
    requestId.current += 1
    if (busy === 'recognizing-image') void laborApi.image.cancel().catch(() => null)
    if (busy === 'resolving-link') void laborApi.marketplace.cancel().catch(() => null)
    setBusy(undefined)
    setProgress('')
    setMode(next)
    setValue('')
    setError('')
    setOutcome('')
    setFailure(undefined)
  }

  async function pickScreenshot() {
    if (busy) return
    const operationId = ++requestId.current
    setBusy('recognizing-image')
    setError('')
    setFailure(undefined)
    setProgress('正在准备识别…')
    try {
      const result = await laborApi.image.pickAndRecognize()
      if (requestId.current !== operationId) return
      if (!result.ok) {
        if (result.error !== 'picker-cancelled' && result.error !== 'cancelled') setError('无法读取这张截图。你可以重新选择，或手动输入企业名称。')
        return
      }
      setValue(result.value.rawText)
      setCandidates(result.value.candidates)
      setOrigin('screenshot')
      setFailure(result.value.needsReview ? 'ocr-low-confidence' : undefined)
      setOutcome(result.value.needsReview ? '' : result.value.candidates.length ? `识别出 ${result.value.candidates.length} 个主体候选，请核对名称和关系。` : '未从图片文字中识别出企业主体，可编辑文字或改为手动输入。')
    } catch {
      if (requestId.current !== operationId) return
      setFailure('ocr-low-confidence')
    } finally { if (requestId.current === operationId) { setBusy(undefined); setProgress('') } }
  }

  async function cancel() {
    const current = busy
    if (!current) return
    requestId.current += 1
    setBusy(undefined)
    setProgress('')
    setError('已取消，可以更换输入方式。')
    setFailure(undefined)
    if (current === 'recognizing-image') await laborApi.image.cancel().catch(() => null)
    else await laborApi.marketplace.cancel().catch(() => null)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const validation = validateIntake(mode, value)
    if (validation) { setError(validation); return }
    setError('')
    setOutcome('')
    setFailure(undefined)

    if (mode === 'company-name') {
      const name = value.trim()
      setCandidates([subjectCandidate('unknown', name, `手动输入：${name}`)])
      setOrigin('company-name')
      setShowConfirmation(true)
      return
    }
    if (mode === 'screenshot') {
      const text = value.trim()
      const found = candidatesFromLabelledText(text)
      if (text && found.length === 0) found.push(subjectCandidate('unknown', text.split(/\r?\n/u).find(line => line.trim())?.trim().slice(0, 120) ?? text.slice(0, 120), '根据截图文字手动整理'))
      setCandidates(found)
      setOrigin('screenshot')
      if (!found.length) { setError('请输入截图中出现的企业或品牌名称。'); return }
      setShowConfirmation(true)
      return
    }

    setBusy('resolving-link')
    const operationId = ++requestId.current
    try {
      const resolution = await laborApi.marketplace.resolve(value.trim())
      if (requestId.current !== operationId) return
      setCandidates(resolution.candidates)
      setOrigin('product-link')
      if (resolution.candidates.length) {
        setOutcome(resolution.productTitle ? `商品：${resolution.productTitle}` : '商品页已读取，请确认具体企业主体。')
        setShowConfirmation(true)
      } else {
        if (resolution.status === 'blocked') setFailure('link-blocked')
        else setError(resolution.warnings[0] || '未能从商品页读取企业信息。你可以尝试上传截图或手动输入。')
      }
    } catch {
      if (requestId.current !== operationId) return
      setFailure('link-blocked')
    } finally { if (requestId.current === operationId) setBusy(undefined) }
  }

  const inputLabel = mode === 'company-name' ? '企业或品牌名称' : mode === 'product-link' ? '商品链接' : '截图中识别的文字（可编辑）'
  const placeholder = mode === 'company-name' ? '例如：示例制造有限公司' : mode === 'product-link' ? '粘贴淘宝、京东、抖音或拼多多商品链接' : '选择截图后，识别出的文字会显示在这里'
  const primaryLabel = busy === 'resolving-link' ? '正在读取商品页…' : busy === 'recognizing-image' ? '正在识别截图…' : mode === 'screenshot' ? '选择截图' : '继续确认主体'

  return <AppChrome onHistory={onHistory} onSettings={onSettings}>
    <main className="intake-shell">
      <p className="eyebrow">公开信息 · 来源可核验</p>
      <h1>了解一家企业，<br className="wide-break" />如何对待劳动者。</h1>
      <p className="intro-copy">输入企业名称、粘贴商品链接或上传包装截图。我们只整理公开信息，不评分，也不替你作出购买决定。</p>

      <SegmentedInput value={mode} onChange={switchMode} />
      <form id="intake-panel" className="intake-form" role="tabpanel" aria-labelledby={`intake-tab-${mode}`} onSubmit={event => { void submit(event) }}>
        {mode === 'screenshot' ? <>
          <label className="sr-only" htmlFor="intake-value">{inputLabel}</label>
          <textarea id="intake-value" value={value} maxLength={50000} placeholder={placeholder} onChange={event => { setValue(event.target.value); setCandidates([]) }} disabled={Boolean(busy)} rows={5} />
          <div className="form-controls">
            <button className="button-primary" type="button" disabled={Boolean(busy)} onClick={() => { void pickScreenshot() }}>{primaryLabel}</button>
            <button className="text-action" type="submit" disabled={Boolean(busy)}>按文字继续</button>
          </div>
        </> : <>
          <label className="sr-only" htmlFor="intake-value">{inputLabel}</label>
          <input id="intake-value" aria-label={inputLabel} autoComplete="off" value={value} maxLength={2048} placeholder={placeholder} onChange={event => setValue(event.target.value)} disabled={Boolean(busy)} />
          <button className="button-primary" type="submit" disabled={Boolean(busy)}>{primaryLabel}</button>
        </>}
      </form>
      {busy && <div className="busy-row" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" />{busy === 'resolving-link' ? '正在安全读取商品页' : progress || '正在识别本地图片'}<button type="button" className="text-action" onClick={() => { void cancel() }}>取消</button></div>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {failure && <FailureState kind={failure} announcementRole="alert" onAction={() => {
        if (failure === 'link-blocked') switchMode('company-name')
        else document.getElementById('intake-value')?.focus()
      }} />}
      {outcome && <p className="inline-note" role="status">{outcome}</p>}
      <div className="helper-copy"><span className="helper-mark" aria-hidden="true" /><span>截图在本机识别；商品链接只读取公开商品页。检索前会请你确认具体主体。</span></div>
      <ol className="intake-steps" aria-label="检索步骤">
        <li><span>01</span>选择输入方式</li>
        <li><span>02</span>确认具体企业主体</li>
        <li><span>03</span>查看可核验的公开来源</li>
      </ol>
      {confirmed && <section className="confirmed-summary" aria-live="polite">
        <span className="section-kicker">主体已确认</span><strong>{confirmed.subject.name}</strong><span>{modeNames[confirmed.origin]} · {confirmed.subject.role === 'unknown' ? '关系待确认' : '按已确认名称准备检索'}</span>
      </section>}
    </main>
    {showConfirmation && <SubjectConfirmation candidates={candidates} origin={origin} onClose={() => setShowConfirmation(false)} onConfirm={value => {
      setConfirmed(value)
      setShowConfirmation(false)
      onConfirmed?.(value)
      setOutcome(`已确认主体：${value.subject.name}`)
    }} />}
  </AppChrome>
}
