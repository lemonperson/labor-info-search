import { test, expect, _electron as electron } from '@playwright/test'
import Database from 'better-sqlite3'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('database migration failure opens recovery and preserves the newer database file', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'labor-recovery-e2e-'))
  const dbPath = join(userData, 'labor-information.sqlite')
  const db = new Database(dbPath)
  db.pragma('user_version = 2')
  db.close()
  const desktop = await electron.launch({ args: ['.'], env: { ...process.env, LABOR_SEARCH_E2E_USER_DATA: userData } })
  try {
    const page = await desktop.firstWindow()
    await expect(page.getByRole('heading', { name: '本机记录暂时无法读取' })).toBeVisible()
    await expect(page.getByText(/现有数据库文件未被自动删除或覆盖/u)).toBeVisible()
    await desktop.evaluate(({ shell }) => {
      const state = globalThis as typeof globalThis & { recoveryFolder?: string }
      shell.openPath = async path => { state.recoveryFolder = path; return '' }
    })
    await page.getByRole('button', { name: '打开本机数据文件夹' }).click()
    await expect.poll(() => desktop.evaluate(() => (globalThis as typeof globalThis & { recoveryFolder?: string }).recoveryFolder)).toBe(userData)
    const reopened = new Database(dbPath, { readonly: true })
    expect(reopened.pragma('user_version', { simple: true })).toBe(2)
    reopened.close()
    await expect(page.getByRole('button', { name: '关闭并重新打开应用' })).toBeVisible()
  } finally {
    await desktop.close()
    await rm(userData, { recursive: true, force: true })
  }
})
