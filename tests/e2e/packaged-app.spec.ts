import { test, expect, _electron as electron } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const executable = resolve('dist/win-unpacked/劳动信息检索.exe')

test('packaged app starts with disclosures, uses its bundled OCR model, creates local data, and shuts down cleanly', async () => {
  test.setTimeout(60_000)
  expect(existsSync(executable), `packaged executable missing at ${executable}`).toBe(true)
  const archive = resolve('dist/win-unpacked/resources/app.asar')
  expect(existsSync(archive), `packaged ASAR missing at ${archive}`).toBe(true)
  expect(readFileSync(archive).includes(Buffer.from('e2e-fixture-connector'))).toBe(false)
  const userData = mkdtempSync(join(tmpdir(), 'labor-packaged-e2e-'))
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  delete env.ELECTRON_RUN_AS_NODE
  env.LABOR_SEARCH_E2E_USER_DATA = userData
  env.LABOR_SEARCH_E2E_PACKAGED = 'enabled'
  env.HTTP_PROXY = 'http://127.0.0.1:9'
  env.HTTPS_PROXY = 'http://127.0.0.1:9'
  env.ALL_PROXY = 'http://127.0.0.1:9'
  const desktop = await electron.launch({ executablePath: executable, env })
  try {
    const actualUserData = await desktop.evaluate(({ app }) => app.getPath('userData'))
    expect(actualUserData).toBe(userData)
    const page = await desktop.firstWindow()
    const disclosure = page.getByRole('dialog', { name: '本地保存与网络检索说明' })
    await expect(disclosure).toBeVisible()
    await expect(page.getByRole('button', { name: '我已了解，继续' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /了解一家企业/u })).toHaveCount(0)
    await page.screenshot({ path: 'docs/screenshots/first-run.png', fullPage: true })

    expect(await page.evaluate(() => window.laborApi.getAppInfo())).toEqual({
      name: '劳动信息检索', version: '0.1.0', platform: 'win32'
    })
    const packagedResources = await desktop.evaluate(({ app }) => ({ packaged: app.isPackaged, resourcesPath: process.resourcesPath }))
    expect(packagedResources.packaged).toBe(true)
    expect(existsSync(join(packagedResources.resourcesPath, 'ocr', 'chi_sim.traineddata.gz'))).toBe(true)

    await desktop.evaluate(({ dialog }, imagePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [imagePath] })
    }, resolve('tests/fixtures/ocr/package-label.png'))
    await page.getByRole('button', { name: '我已了解，继续' }).click()
    await page.screenshot({ path: 'docs/screenshots/intake.png', fullPage: true })
    await page.getByRole('tab', { name: '上传截图' }).click()
    await page.getByRole('button', { name: '选择截图' }).click()
    await expect(page.getByRole('status').filter({ hasText: '候选' })).toContainText('候选', { timeout: 45_000 })
    await page.getByRole('button', { name: '按文字继续' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('radio', { name: /深圳先进制造有限公司/u })).toBeVisible()
    await expect.poll(() => existsSync(join(userData, 'labor-information.sqlite'))).toBe(true)

    expect(existsSync(join(userData, 'labor-information.sqlite'))).toBe(true)
  } finally {
    await desktop.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
