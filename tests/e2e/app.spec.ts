import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import type { WebContents, WebPreferences } from 'electron'

let desktop: ElectronApplication
test.beforeEach(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  delete env.NO_COLOR
  delete env.ELECTRON_RUN_AS_NODE
  desktop = await electron.launch({ args: ['.'], env })
})
test.afterEach(async () => { await desktop?.close() })

test('loads the product through a minimal isolated bridge without Node globals', async () => {
  const page = await desktop.firstWindow()
  await expect(page.getByRole('heading', { name: '劳动信息检索' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('已就绪')
  expect(await page.evaluate(async () => ({
    methods: Object.keys(window.laborApi),
    info: await window.laborApi.getAppInfo(),
    globals: ['require', 'process', 'Buffer', '__dirname', 'module', 'ipcRenderer'].map(key => typeof Reflect.get(window, key))
  }))).toEqual({
    methods: ['getAppInfo', 'history', 'settings'],
    info: { name: '劳动信息检索', version: '0.1.0', platform: 'win32' },
    globals: ['undefined', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined']
  })
  const preferences = await desktop.evaluate(({ BrowserWindow }) => {
    const options = (BrowserWindow.getAllWindows()[0].webContents as WebContents & {
      getLastWebPreferences(): WebPreferences
    }).getLastWebPreferences()
    return { nodeIntegration: options.nodeIntegration, contextIsolation: options.contextIsolation, sandbox: options.sandbox, webSecurity: options.webSecurity }
  })
  expect(preferences).toEqual({ nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true })
})

test('denies renderer navigation and new windows', async () => {
  const page = await desktop.firstWindow()
  await expect(page.getByRole('heading', { name: '劳动信息检索' })).toBeVisible()
  const initialUrl = page.url()
  await desktop.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    ;(globalThis as typeof globalThis & { navigationBlocked: Promise<boolean> }).navigationBlocked = new Promise(resolve => {
      contents.once('will-navigate', event => { resolve(event.defaultPrevented) })
    })
  })
  await page.evaluate(() => { window.location.href = 'https://example.invalid/' })
  expect(await desktop.evaluate(async () => (globalThis as typeof globalThis & { navigationBlocked: Promise<boolean> }).navigationBlocked)).toBe(true)
  expect(page.url()).toBe(initialUrl)
  await page.evaluate(() => window.open('https://example.invalid/'))
  expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  // A cancelled navigation emits no load event; inspect the retained document directly.
  expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe('劳动信息检索')
})

test('round trips validated privacy settings through the isolated storage bridge', async () => {
  const page = await desktop.firstWindow()
  await expect(page.getByRole('status')).toHaveText('已就绪')
  const original = await page.evaluate(() => window.laborApi.settings.get())
  try {
    expect(await page.evaluate(() => window.laborApi.settings.update({ saveHistory: false, theme: 'dark' })))
      .toEqual({ ...original, saveHistory: false, theme: 'dark' })
    expect(await page.evaluate(() => window.laborApi.settings.get()))
      .toEqual({ ...original, saveHistory: false, theme: 'dark' })
    expect(await page.evaluate(() => window.laborApi.history.get('nonexistent-storage-smoke-test'))).toBeNull()
    expect(await page.evaluate(() => window.laborApi.history.list(1))).toBeInstanceOf(Array)
    expect(await page.evaluate(async () => {
      try { await window.laborApi.settings.update({ saveHistory: 'yes' } as never); return false }
      catch { return true }
    })).toBe(true)
  } finally {
    await page.evaluate(settings => window.laborApi.settings.update(settings), original)
  }
})
