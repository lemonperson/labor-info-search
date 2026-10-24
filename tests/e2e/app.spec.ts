import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import type { WebContents, WebPreferences } from 'electron'
import { resolve } from 'node:path'

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
  await expect(page.getByRole('heading', { name: /了解一家企业，\s*如何对待劳动者。/u })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('已就绪')
  expect(await page.evaluate(async () => ({
    methods: Object.keys(window.laborApi),
    info: await window.laborApi.getAppInfo(),
    globals: ['require', 'process', 'Buffer', '__dirname', 'module', 'ipcRenderer'].map(key => typeof Reflect.get(window, key))
  }))).toEqual({
    methods: ['getAppInfo', 'history', 'settings', 'image', 'marketplace'],
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
  await expect(page.getByRole('heading', { name: /了解一家企业，\s*如何对待劳动者。/u })).toBeVisible()
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
  expect(await page.evaluate(() => document.querySelector('h1')?.textContent?.replace(/\s+/gu, ''))).toBe('了解一家企业，如何对待劳动者。')
})

test('manual intake confirms the named company before marking a subject ready', async () => {
  const page = await desktop.firstWindow()
  const input = page.getByRole('textbox', { name: '企业或品牌名称' })
  await input.fill('青禾制造有限公司')
  await page.getByRole('button', { name: '继续确认主体' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('主体尚未权威核验')).toBeVisible()
  await expect(page.getByText('手动输入：青禾制造有限公司')).toBeVisible()
  await expect(page.getByText('主体已确认', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(input).toHaveValue('青禾制造有限公司')
  await page.getByRole('button', { name: '继续确认主体' }).click()
  await page.getByRole('button', { name: '确认主体', exact: true }).click()
  await expect(page.getByText('已确认主体：青禾制造有限公司')).toBeVisible()
  await expect(page.getByText('主体已确认', { exact: true })).toBeVisible()
  expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

test('input modes switch with keyboard, validate fields, and stay composed at narrow widths', async () => {
  const page = await desktop.firstWindow()
  const companyTab = page.getByRole('tab', { name: '企业名称' })
  await companyTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: '商品链接' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: '上传截图' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '按文字继续' }).click()
  await expect(page.getByRole('alert')).toContainText('请选择商品包装或详情截图')

  await page.getByRole('tab', { name: '企业名称' }).click()
  await page.setViewportSize({ width: 1120, height: 760 })
  await page.screenshot({ path: 'test-results/task8-intake-normal.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: 'test-results/task8-intake-narrow.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('tab', { name: '企业名称' })).toBeVisible()
  await page.getByRole('tab', { name: '上传截图' }).click()
  await expect(page.getByRole('button', { name: '选择截图' })).toBeVisible()
})

test('a blocked product link stays in the app and offers screenshot and manual fallbacks', async () => {
  const page = await desktop.firstWindow()
  await page.getByRole('tab', { name: '商品链接' }).click()
  await page.getByRole('textbox', { name: '商品链接' }).fill('https://item.jd.com:1/1.html')
  await page.getByRole('button', { name: '继续确认主体' }).click()
  await expect(page.getByRole('alert')).toContainText(/无法安全读取商品页|商品页/ , { timeout: 15_000 })
  await expect(page.getByRole('tab', { name: '上传截图' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '企业名称' })).toBeVisible()
  expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  expect(page.url()).not.toContain('jd.com')
})

test('OCR candidates can be corrected before explicit confirmation without opening a browser', async () => {
  const page = await desktop.firstWindow()
  const imagePath = resolve('tests/fixtures/ocr/package-label.png')
  await desktop.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, imagePath)
  await page.getByRole('tab', { name: '上传截图' }).click()
  await page.getByRole('button', { name: '选择截图' }).click()
  await expect(page.getByRole('status').filter({ hasText: '候选' })).toContainText('候选', { timeout: 30_000 })
  await page.getByRole('button', { name: '按文字继续' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('radio', { name: /深圳先进制造有限公司/ }).check()
  const name = page.getByRole('textbox', { name: '企业或品牌名称' })
  await name.fill('更正后的示例制造有限公司')
  await expect(page.getByText('生产企业：深圳先进制造有限公司')).toBeVisible()
  await page.getByRole('button', { name: '确认主体', exact: true }).click()
  await expect(page.getByText('已确认主体：更正后的示例制造有限公司')).toBeVisible()
  expect(await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
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
