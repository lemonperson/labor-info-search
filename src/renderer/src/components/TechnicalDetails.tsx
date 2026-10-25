import { useState } from 'react'

export function TechnicalDetails({ value }: { value: string }) {
  const [message, setMessage] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setMessage('已复制技术详情')
    } catch {
      setMessage('无法自动复制；你可以选中上方文字后复制。')
    }
  }
  return <details className="technical-details">
    <summary>技术详情</summary>
    <pre>{value}</pre>
    <button type="button" className="text-action technical-copy" onClick={() => { void copy() }}>复制技术详情</button>
    {message && <p className="quiet-copy" role="status">{message}</p>}
  </details>
}
