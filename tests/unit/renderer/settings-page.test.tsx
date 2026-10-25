import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsPage } from '../../../src/renderer/src/features/settings/SettingsPage'
import type { AppSettings } from '../../../src/shared/types'

describe('settings page', () => {
  it('keeps ordinary preferences quiet and puts technical details behind disclosure', () => {
    const settings: AppSettings = { saveHistory: true, theme: 'system', browserProvider: 'bing' }
    const html = renderToStaticMarkup(<SettingsPage settings={settings} onSaveHistoryChange={() => {}} />)
    expect(html).toContain('保存本机检索历史')
    expect(html).toContain('仅保留在这台设备上')
    expect(html).toContain('技术详情')
    expect(html).not.toContain('renderer')
    expect(html).not.toContain('IPC')
  })
})
