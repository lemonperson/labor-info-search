import { useEffect, useState } from 'react'
import { laborApi } from './api/labor-api'
import { IntakePage } from './features/intake/IntakePage'
import { SearchProgress } from './features/search/SearchProgress'
import { ResultsPage } from './features/results/ResultsPage'
import { HistoryPage } from './features/history/HistoryPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { FirstRunDisclosure } from './features/settings/FirstRunDisclosure'
import { FailureState } from './components/FailureState'
import type { AppSettings, SearchSession, SessionProgress } from '../../shared/types'
import type { ConfirmedSubjectInput } from './features/subject/subject-state'

type Page = 'intake' | 'history' | 'settings'

export function App() {
  const [status, setStatus] = useState('正在启动…')
  const [settings, setSettings] = useState<AppSettings>()
  const [page, setPage] = useState<Page>('intake')
  const [session, setSession] = useState<SearchSession>()
  const [history, setHistory] = useState<SearchSession[]>([])
  const [progress, setProgress] = useState<SessionProgress>()
  const [searchError, setSearchError] = useState('')
  const [storageError, setStorageError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([laborApi.getAppInfo(), laborApi.settings.get()]).then(([, loadedSettings]) => {
      if (active) setSettings(loadedSettings)
      if (active) setStatus('已就绪')
    }).catch(() => {
      if (active) { setStorageError('本机设置暂时无法读取。'); setStatus('启动失败，请重新打开应用。') }
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (page !== 'history' || !settings?.saveHistory) { setHistory([]); return }
    let active = true
    setStorageError('')
    void laborApi.history.list().then(items => { if (active) setHistory(items) }).catch(() => {
      if (active) setStorageError('检索历史暂时无法读取。')
    })
    return () => { active = false }
  }, [page, settings?.saveHistory])

  async function updateSettings(patch: Partial<AppSettings>) {
    try {
      const next = await laborApi.settings.update(patch)
      setSettings(next)
      setStorageError('')
    } catch {
      setStorageError('设置未能保存。请重新打开应用后再试。')
    }
  }

  async function startSearch(input: ConfirmedSubjectInput) {
    if (!settings?.disclosureAcceptedAt) { setPage('intake'); return }
    const sessionId = crypto.randomUUID()
    setSession(undefined)
    setSearchError('')
    setProgress({ sessionId, phase: 'preparing_queries', completed: 0, total: 0 })
    const dispose = laborApi.search.onProgress(sessionId, setProgress)
    try {
      setSession(await laborApi.search.start(input, sessionId))
      setProgress(undefined)
    } catch {
      setProgress(undefined)
      setSearchError('检索暂时无法完成。请检查网络连接后重试。')
    } finally { dispose() }
  }

  async function cancelSearch() {
    if (!progress) return
    await laborApi.search.cancel(progress.sessionId).catch(() => null)
  }

  async function openHistory(id: string) {
    try {
      const saved = await laborApi.history.get(id)
      if (!saved) { setStorageError('这条历史记录已不存在。'); return }
      setSession(saved)
      setPage('intake')
    } catch { setStorageError('这条历史记录暂时无法打开。') }
  }

  async function deleteHistory(id: string) {
    try {
      await laborApi.history.delete(id)
      setHistory(items => items.filter(item => item.id !== id))
      setStorageError('')
    } catch { setStorageError('这条历史记录未能删除。') }
  }

  async function clearHistory() {
    try {
      await laborApi.history.clear()
      setHistory([])
      setStorageError('')
    } catch { setStorageError('历史记录未能清空。') }
  }

  async function acceptDisclosure(saveHistory: boolean) {
    await updateSettings({ saveHistory, disclosureAcceptedAt: new Date().toISOString() })
  }

  return <>
    {!settings && <main className="bootstrap-failure"><FailureState kind="database-recovery" onAction={() => window.location.reload()} technicalDetails={storageError || undefined} /></main>}
    {settings && !settings.disclosureAcceptedAt && <FirstRunDisclosure saveHistory={settings.saveHistory} error={storageError || undefined} onAccept={value => { void acceptDisclosure(value) }} />}
    {settings?.disclosureAcceptedAt && !session && !progress && page === 'intake' && <IntakePage onConfirmed={input => { void startSearch(input) }} onHistory={() => setPage('history')} onSettings={() => setPage('settings')} />}
    {settings?.disclosureAcceptedAt && !session && !progress && page === 'history' && <HistoryPage sessions={history} saveHistory={settings.saveHistory} error={storageError || undefined} onIntake={() => setPage('intake')} onSettings={() => setPage('settings')} onOpen={item => { void openHistory(item.id) }} onDelete={id => { void deleteHistory(id) }} onClear={() => { void clearHistory() }} />}
    {settings?.disclosureAcceptedAt && !session && !progress && page === 'settings' && <SettingsPage settings={settings} error={storageError || undefined} onIntake={() => setPage('intake')} onHistory={() => setPage('history')} onSaveHistoryChange={value => { void updateSettings({ saveHistory: value }) }} />}
    {progress && !session && <SearchProgress progress={progress} onCancel={() => { void cancelSearch() }} />}
    {searchError && <div className="search-error"><FailureState kind="offline" onAction={() => { setSearchError(''); setProgress(undefined); setPage('intake') }} technicalDetails={searchError} /></div>}
    {session && <ResultsPage session={session} onHistory={() => { setSession(undefined); setPage('history') }} onNewSearch={() => { setSession(undefined); setProgress(undefined); setPage('intake') }} />}
    <div className="app-status" role="status" aria-live="polite">{status}</div>
  </>
}
