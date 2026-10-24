import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseHandle } from '../../../src/main/database/database'
import { SettingsRepository } from '../../../src/main/database/settings-repository'

let directory: string
let db: DatabaseHandle
let repository: SettingsRepository
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'labor-settings-'))
  db = openDatabase(join(directory, 'test.sqlite'))
  repository = new SettingsRepository(db)
})
afterEach(() => { db?.close(); rmSync(directory, { recursive: true, force: true }) })

describe('local privacy settings', () => {
  it('defaults to private local history with the system theme and Bing', () => {
    expect(repository.getSettings()).toEqual({ saveHistory: true, theme: 'system', browserProvider: 'bing' })
  })
  it('persists partial changes and keeps unspecified preferences', () => {
    expect(repository.updateSettings({ saveHistory: false, theme: 'dark' })).toEqual({ saveHistory: false, theme: 'dark', browserProvider: 'bing' })
    db.close()
    db = openDatabase(join(directory, 'test.sqlite'))
    expect(new SettingsRepository(db).getSettings()).toEqual({ saveHistory: false, theme: 'dark', browserProvider: 'bing' })
  })
  it('rejects unsupported or unknown settings without changing preferences', () => {
    for (const patch of [{ saveHistory: 'yes' }, { theme: 'invalid' }, { browserProvider: 'invalid' }, { imageBytes: 'private' }]) {
      expect(() => repository.updateSettings(patch as never)).toThrow()
    }
    expect(repository.getSettings()).toEqual({ saveHistory: true, theme: 'system', browserProvider: 'bing' })
  })
})
