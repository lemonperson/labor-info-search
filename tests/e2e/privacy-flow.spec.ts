import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function launchIsolated() {
  const userData = await mkdtemp(join(tmpdir(), 'labor-privacy-e2e-'))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  env.LABOR_SEARCH_E2E_USER_DATA = userData
  env.LABOR_SEARCH_E2E_FIXTURE = 'enabled'
  const desktop = await electron.launch({ args: ['.'], env })
  return { desktop, cleanup: async () => { await desktop.close(); await rm(userData, { recursive: true, force: true }) } }
}

async function submitFixtureSearch(page: Page) {
  await page.getByRole('textbox', { name: '企业或品牌名称' }).fill('青禾制造有限公司')
  await page.getByRole('button', { name: '继续确认主体' }).click()
  await page.getByRole('button', { name: '确认主体', exact: true }).click()
  await expect(page.getByRole('heading', { name: '青禾制造有限公司 的检索结果' })).toBeVisible({ timeout: 45_000 })
}

test('first run requires disclosure acknowledgement before the search flow', async () => {
  const { desktop, cleanup } = await launchIsolated()
  try {
    const page = await desktop.firstWindow()
    const disclosure = page.getByRole('dialog', { name: '本地保存与网络检索说明' })
    await expect(disclosure).toBeVisible()
    const disclosureHistory = disclosure.getByRole('checkbox', { name: /保存本机检索历史/u })
    await expect(disclosureHistory).toBeChecked()
    await expect(page.getByRole('button', { name: '我已了解，继续' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /了解一家企业/u })).toHaveCount(0)
    await page.getByRole('button', { name: '我已了解，继续' }).focus()
    await expect(page.getByRole('button', { name: '我已了解，继续' })).toBeFocused()
    expect(await page.getByRole('button', { name: '我已了解，继续' }).evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
    expect(Number.parseFloat(await page.getByRole('button', { name: '我已了解，继续' }).evaluate(element => getComputedStyle(element).outlineWidth))).toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    await expect(disclosure).toBeVisible()
    await disclosureHistory.click()
    await expect(disclosureHistory).not.toBeChecked()
    await page.getByRole('button', { name: '我已了解，继续' }).click()
    await expect.poll(() => page.evaluate(() => window.laborApi.settings.get())).toMatchObject({ saveHistory: false, disclosureAcceptedAt: expect.any(String) })
    const input = page.getByRole('textbox', { name: '企业或品牌名称' })
    await expect(page.getByRole('heading', { name: '正在整理可核验的来源' })).toHaveCount(0)
    await input.fill('青禾制造有限公司')
    await page.getByRole('button', { name: '继续确认主体' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '继续确认主体' })).toBeFocused()
  } finally { await cleanup() }
})

test('history preference controls future retention, and existing rows remain manageable', async () => {
  test.setTimeout(90_000)
  const { desktop, cleanup } = await launchIsolated()
  try {
    const page = await desktop.firstWindow()
    await page.getByRole('button', { name: '我已了解，继续' }).click()
    await page.getByRole('button', { name: '设置' }).click()
    const historyToggle = page.getByRole('checkbox', { name: '保存本机检索历史' })
    await expect(historyToggle).toBeChecked()
    await historyToggle.click()
    await expect(historyToggle).not.toBeChecked()
    await page.getByRole('button', { name: '开始检索' }).click()
    await submitFixtureSearch(page)
    expect(await page.evaluate(() => window.laborApi.history.list())).toEqual([])
    await page.getByRole('button', { name: '历史' }).click()
    await expect(page.getByText('已关闭历史记录保存')).toBeVisible()
    await expect(page.getByRole('button', { name: '清空历史记录' })).toBeDisabled()

    await page.getByRole('button', { name: '设置' }).click()
    const historyToggleAgain = page.getByRole('checkbox', { name: '保存本机检索历史' })
    await historyToggleAgain.click()
    await expect(historyToggleAgain).toBeChecked()
    await page.getByRole('button', { name: '开始检索' }).click()
    await submitFixtureSearch(page)
    await page.getByRole('button', { name: '新建检索' }).click()
    await submitFixtureSearch(page)
    await page.getByRole('button', { name: '新建检索' }).click()
    await page.getByRole('button', { name: '设置' }).click()
    await page.getByRole('checkbox', { name: '保存本机检索历史' }).click()
    await expect(page.getByRole('checkbox', { name: '保存本机检索历史' })).not.toBeChecked()
    await page.getByRole('button', { name: '历史' }).click()
    await expect(page.getByRole('button', { name: /青禾制造有限公司/u })).toHaveCount(2)
    await page.getByRole('button', { name: '删除这条记录' }).first().click()
    await expect(page.getByRole('button', { name: /青禾制造有限公司/u })).toHaveCount(1)

    const clear = page.getByRole('button', { name: '清空历史记录' })
    await clear.focus()
    await page.keyboard.press('Enter')
    const confirmation = page.getByRole('dialog', { name: '清空所有历史记录？' })
    await expect(confirmation).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(confirmation).toHaveCount(0)
    await expect(clear).toBeFocused()
    await clear.click()
    await confirmation.getByRole('button', { name: '清空历史记录' }).click()
    await expect(page.getByText('还没有本机检索记录')).toBeVisible()
    expect(await page.evaluate(() => window.laborApi.history.list())).toEqual([])
  } finally { await cleanup() }
})
