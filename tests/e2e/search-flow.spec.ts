import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'

let desktop: ElectronApplication
test.beforeEach(async () => {
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  delete env.NO_COLOR
  delete env.ELECTRON_RUN_AS_NODE
  desktop = await electron.launch({ args: ['.'], env })
})
test.afterEach(async () => { await desktop?.close() })

test('runs a best-effort session only after explicit subject confirmation', async () => {
  test.setTimeout(90_000)
  const page = await desktop.firstWindow()
  const original = await page.evaluate(() => window.laborApi.settings.get())
  await page.evaluate(() => window.laborApi.settings.update({ saveHistory: false }))
  try {
    await page.getByRole('textbox', { name: '企业或品牌名称' }).fill('青禾劳动检索端到端测试公司')
    await page.getByRole('button', { name: '继续确认主体' }).click()
    await page.getByRole('button', { name: '确认主体', exact: true }).click()
    await expect(page.getByText('已确认主体：青禾劳动检索端到端测试公司')).toBeVisible()

    const result = await page.evaluate(async () => {
      const progress: Array<{ sessionId: string; phase: string }> = []
      const dispose = window.laborApi.search.onProgress(event => progress.push({ sessionId: event.sessionId, phase: event.phase }))
      try {
        const subject = {
          subject: { id: 'unknown:青禾劳动检索端到端测试公司', name: '青禾劳动检索端到端测试公司', role: 'unknown' as const,
            verification: 'user-confirmed' as const, evidence: ['手动输入：青禾劳动检索端到端测试公司'] },
          selectedEvidence: ['手动输入：青禾劳动检索端到端测试公司'], verification: 'user-confirmed' as const, origin: 'company-name' as const
        }
        const session = await window.laborApi.search.start(subject)
        return { session, progress }
      } finally { dispose() }
    })
    expect(result.session).toMatchObject({ inputType: 'company-name', subject: { name: '青禾劳动检索端到端测试公司' }, status: expect.stringMatching(/completed|partial|failed|cancelled/) })
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
      await window.laborApi.search.start({} as never)
      return false
    } catch { return true }
  })
  expect(rejected).toBe(true)
  expect(await page.evaluate(() => window.laborApi.search.cancel('unknown-session'))).toBeNull()
})
