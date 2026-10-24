import { useEffect, useState } from 'react'
import { laborApi } from './api/labor-api'

export function App() {
  const [status, setStatus] = useState('正在启动…')

  useEffect(() => {
    let active = true
    void laborApi.getAppInfo().then(() => {
      if (active) setStatus('已就绪')
    }).catch(() => {
      if (active) setStatus('启动失败，请重启应用。')
    })
    return () => { active = false }
  }, [])

  return (
    <main className="app-surface">
      <h1>劳动信息检索</h1>
      <p role="status" aria-live="polite">{status}</p>
    </main>
  )
}
