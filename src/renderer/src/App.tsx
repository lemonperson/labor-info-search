import { useEffect, useState } from 'react'
import { laborApi } from './api/labor-api'
import { IntakePage } from './features/intake/IntakePage'
import { SearchProgress } from './features/search/SearchProgress'
import { ResultsPage } from './features/results/ResultsPage'
import type { SearchSession, SessionProgress } from '../../shared/types'
import type { ConfirmedSubjectInput } from './features/subject/subject-state'

export function App() {
  const [status, setStatus] = useState('正在启动…')
  const [session, setSession] = useState<SearchSession>()
  const [progress, setProgress] = useState<SessionProgress>()
  const [searchError, setSearchError] = useState('')

  useEffect(() => {
    let active = true
    void laborApi.getAppInfo().then(() => {
      if (active) setStatus('已就绪')
    }).catch(() => {
      if (active) setStatus('启动失败，请重启应用。')
    })
    return () => { active = false }
  }, [])

  async function startSearch(input: ConfirmedSubjectInput) {
    const sessionId = crypto.randomUUID()
    setSession(undefined)
    setSearchError('')
    setProgress({ sessionId, phase: 'preparing_queries', completed: 0, total: 0 })
    const dispose = laborApi.search.onProgress(sessionId, setProgress)
    try {
      setSession(await laborApi.search.start(input, sessionId))
    } catch {
      setProgress(undefined)
      setSearchError('检索暂时无法完成。请稍后重试。')
    } finally { dispose() }
  }

  async function cancelSearch() {
    if (!progress) return
    await laborApi.search.cancel(progress.sessionId).catch(() => null)
  }

  return <>
    {!session && !progress && <IntakePage onConfirmed={input => { void startSearch(input) }} />}
    {progress && !session && <SearchProgress progress={progress} onCancel={() => { void cancelSearch() }} />}
    {searchError && <div className="search-error" role="alert">{searchError}<button type="button" className="text-action" onClick={() => { setSearchError(''); setProgress(undefined) }}>返回输入</button></div>}
    {session && <ResultsPage session={session} onNewSearch={() => { setSession(undefined); setProgress(undefined) }} />}
    <div className="app-status" role="status" aria-live="polite">{status}</div>
  </>
}
