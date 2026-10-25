import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { HistoryPage } from '../../../src/renderer/src/features/history/HistoryPage'
import { SettingsPage } from '../../../src/renderer/src/features/settings/SettingsPage'
import { FirstRunDisclosure } from '../../../src/renderer/src/features/settings/FirstRunDisclosure'
import type { SearchSession, AppSettings } from '../../../src/shared/types'

const settings: AppSettings = { saveHistory: true, theme: 'system', browserProvider: 'bing' }
const history: SearchSession[] = [{ id: 'session-1', inputType: 'company-name', subject: { id: 's', name: '青禾制造', role: 'unknown', verification: 'user-confirmed', evidence: [] }, queries: [], records: [], eventGroups: [], startedAt: '2026-10-25T09:00:00.000Z', status: 'completed', connectorRuns: [] }]

describe('history and privacy pages', () => {
  it('discloses local-only history and blocks search until acknowledgement', () => {
    const html = renderToStaticMarkup(<FirstRunDisclosure saveHistory onAccept={() => {}} />)
    expect(html).toContain('本地保存与网络检索说明')
    expect(html).toContain('检索历史默认只保存在这台设备上')
    expect(html).toContain('截图文件和路径不会保存')
    expect(html).toContain('我已了解，继续')
  })

  it('defaults history saving to enabled and exposes a reversible setting', () => {
    const html = renderToStaticMarkup(<SettingsPage settings={settings} onSaveHistoryChange={() => {}} />)
    expect(html).toContain('保存本机检索历史')
    expect(html).toContain('checked=""')
  })

  it('lists local history rows and offers delete and clear actions', () => {
    const html = renderToStaticMarkup(<HistoryPage sessions={history} onOpen={() => {}} onDelete={() => {}} onClear={() => {}} />)
    expect(html).toContain('青禾制造')
    expect(html).toContain('删除这条记录')
    expect(html).toContain('清空历史记录')
  })

  it('provides an explicit clear action for existing local history', () => {
    const html = renderToStaticMarkup(<HistoryPage sessions={history} onOpen={() => {}} onDelete={() => {}} onClear={() => {}} />)
    expect(html).toContain('清空历史记录')
  })
})
