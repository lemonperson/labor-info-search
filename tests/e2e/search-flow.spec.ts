import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let desktop: ElectronApplication
let userData: string
test.beforeEach(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  delete env.NO_COLOR
  delete env.ELECTRON_RUN_AS_NODE
  userData = await mkdtemp(join(tmpdir(), 'labor-search-e2e-'))
  env.LABOR_SEARCH_E2E_USER_DATA = userData
  env.LABOR_SEARCH_E2E_FIXTURE = 'enabled'
  desktop = await electron.launch({ args: ['.'], env })
  const page = await desktop.firstWindow()
  await expect(page.locator('.app-status')).toHaveText('已就绪')
  const acknowledge = page.getByRole('button', { name: '我已了解，继续' })
  if (await acknowledge.count()) await acknowledge.click()
})
test.afterEach(async () => { await desktop?.close(); if (userData) await rm(userData, { recursive: true, force: true }) })

test('runs a best-effort session only after explicit subject confirmation', async () => {
  test.setTimeout(90_000)
  const page = await desktop.firstWindow()
  const original = await page.evaluate(() => window.laborApi.settings.get())
  await page.evaluate(() => window.laborApi.settings.update({ saveHistory: false }))
  try {
    await page.getByRole('textbox', { name: '企业或品牌名称' }).fill('青禾劳动检索端到端测试公司')
    await page.getByRole('button', { name: '继续确认主体' }).click()
    await page.getByRole('button', { name: '确认主体', exact: true }).click()
    await expect(page.getByRole('heading', { name: '青禾劳动检索端到端测试公司 的检索结果' })).toBeVisible()
    await expect(page.getByRole('button', { name: /劳动争议信息测试记录/ })).toBeVisible()
    await page.getByRole('group', { name: '按来源类型筛选' }).getByLabel('其他来源').check()
    await page.getByRole('button', { name: /劳动争议信息测试记录/ }).click()
    await expect(page.getByRole('main', { name: '来源详情' })).toContainText('https://example.com/labor-search-fixture')
    await page.getByRole('button', { name: '返回检索结果' }).click()
    await expect(page.getByRole('group', { name: '按来源类型筛选' }).getByLabel('其他来源')).toBeChecked()
    await page.getByRole('button', { name: '在浏览器中继续搜索' }).click()
    const browserDialog = page.getByRole('dialog')
    await expect(browserDialog).toContainText('www.bing.com')
    const cancelButton = browserDialog.getByRole('button', { name: '取消' })
    const confirmButton = browserDialog.getByRole('button', { name: '确认并打开浏览器' })
    await expect(cancelButton).toBeFocused()
    await page.getByRole('button', { name: '在浏览器中继续搜索' }).evaluate(element => (element as HTMLElement).focus())
    await page.keyboard.press('Tab')
    await expect(cancelButton).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(confirmButton).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(cancelButton).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(confirmButton).toBeFocused()
    await expect(browserDialog).toHaveAccessibleName('在浏览器中打开此检索词？')
    await expect(browserDialog).toContainText('"青禾劳动检索端到端测试公司" "欠薪" "工资拖欠"')
    await expect(browserDialog).toContainText('本次只会打开上方显示的这一条检索词')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '在浏览器中继续搜索' })).toBeFocused()
    await page.getByRole('button', { name: '在浏览器中继续搜索' }).click()
    await desktop.evaluate(({ shell }) => {
      const state = globalThis as typeof globalThis & { task11ExternalOpens: string[] }
      state.task11ExternalOpens = []
      shell.openExternal = async url => { state.task11ExternalOpens.push(url) }
    })
    await page.getByRole('dialog').getByRole('button', { name: '取消' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '在浏览器中继续搜索' })).toBeFocused()
    expect(await desktop.evaluate(() => (globalThis as typeof globalThis & { task11ExternalOpens: string[] }).task11ExternalOpens)).toEqual([])
    await page.getByRole('button', { name: '在浏览器中继续搜索' }).click()
    await page.getByRole('dialog').getByRole('button', { name: '确认并打开浏览器' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const openedUrls = await desktop.evaluate(() => (globalThis as typeof globalThis & { task11ExternalOpens: string[] }).task11ExternalOpens)
    expect(openedUrls).toHaveLength(1)
    expect(new URL(openedUrls[0]).hostname).toBe('www.bing.com')
    expect(new URL(openedUrls[0]).protocol).toBe('https:')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.screenshot({ path: 'test-results/task11-results-wide.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.getByRole('heading', { name: '青禾劳动检索端到端测试公司 的检索结果' })).toBeVisible()
    await page.screenshot({ path: 'test-results/task11-results-narrow.png', fullPage: true })

    const result = await page.evaluate(async () => {
      const progress: Array<{ sessionId: string; phase: string }> = []
      const sessionId = crypto.randomUUID()
      const dispose = window.laborApi.search.onProgress(sessionId, event => progress.push({ sessionId: event.sessionId, phase: event.phase }))
      try {
        const subject = {
          subject: { id: 'unknown:青禾劳动检索端到端测试公司', name: '青禾劳动检索端到端测试公司', role: 'unknown' as const,
            verification: 'user-confirmed' as const, evidence: ['手动输入：青禾劳动检索端到端测试公司'] },
          selectedEvidence: ['手动输入：青禾劳动检索端到端测试公司'], verification: 'user-confirmed' as const, origin: 'company-name' as const
        }
        const session = await window.laborApi.search.start(subject, sessionId)
        return { session, progress }
      } finally { dispose() }
    })
    expect(result.session).toMatchObject({ inputType: 'company-name', subject: { name: '青禾劳动检索端到端测试公司' }, status: 'completed' })
    expect(result.session.records).toHaveLength(1)
    expect(result.session.connectorRuns).toEqual([{ connectorId: 'e2e-fixture', status: 'completed' }])
    expect(result.session.records.every(record => record.subjectId === result.session.subject.id)).toBe(true)
    expect(result.progress.map(event => event.phase)).toEqual(expect.arrayContaining(['preparing_queries', 'searching', 'normalizing', 'saving', 'complete']))
    expect(result.progress.every(event => event.sessionId === result.session.id)).toBe(true)
    expect(await page.evaluate(id => window.laborApi.history.get(id), result.session.id)).toBeNull()
  } finally {
    await page.evaluate(settings => window.laborApi.settings.update(settings), original)
  }
})

 test('rejects unconfirmed or malformed search payloads in preload', async () => {
  const page = await desktop.firstWindow()
  const rejected = await page.evaluate(async () => {
    try {
      await window.laborApi.search.start({} as never, crypto.randomUUID())
      return false
    } catch { return true }
  })
  expect(rejected).toBe(true)
  expect(await page.evaluate(() => window.laborApi.search.cancel(crypto.randomUUID()))).toBeNull()
})
