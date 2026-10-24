import type { KeyboardEvent } from 'react'
import type { IntakeMode } from '../features/intake/intake-state'

const options: Array<{ value: IntakeMode; label: string }> = [
  { value: 'company-name', label: '企业名称' },
  { value: 'product-link', label: '商品链接' },
  { value: 'screenshot', label: '上传截图' }
]

type Props = { value: IntakeMode; onChange(value: IntakeMode): void }

export function SegmentedInput({ value, onChange }: Props) {
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const current = options.findIndex(option => option.value === value)
    let next = current
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % options.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current + options.length - 1) % options.length
    else return
    event.preventDefault()
    onChange(options[next].value)
    requestAnimationFrame(() => document.getElementById(`intake-tab-${options[next].value}`)?.focus())
  }

  return <div className="mode-switch" role="tablist" aria-label="检索方式">
    {options.map(option => <button
      key={option.value}
      id={`intake-tab-${option.value}`}
      type="button"
      role="tab"
      aria-selected={value === option.value}
      aria-controls="intake-panel"
      tabIndex={value === option.value ? 0 : -1}
      className={value === option.value ? 'is-active' : ''}
      onKeyDown={onKeyDown}
      onClick={() => onChange(option.value)}
    >{option.label}</button>)}
  </div>
}
