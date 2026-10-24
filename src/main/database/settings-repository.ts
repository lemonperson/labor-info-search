import { appSettingsSchema, settingsPatchSchema } from '../../shared/schemas'
import type { AppSettings } from '../../shared/types'
import type { DatabaseHandle } from './database'

const defaults: AppSettings = { saveHistory: true, theme: 'system', browserProvider: 'bing' }

export class SettingsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  getSettings(): AppSettings {
    const row = this.db.prepare('SELECT data FROM settings WHERE id = 1').get() as { data: string } | undefined
    return appSettingsSchema.parse(row ? JSON.parse(row.data) : defaults)
  }

  updateSettings(patch: Partial<AppSettings>): AppSettings {
    const parsed = settingsPatchSchema.parse(patch)
    return this.db.transaction(() => {
      const settings = appSettingsSchema.parse({ ...this.getSettings(), ...parsed })
      this.db.prepare('INSERT INTO settings(id, data) VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data')
        .run(JSON.stringify(settings))
      return settings
    })()
  }
}
