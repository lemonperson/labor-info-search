import type { z } from 'zod'
import type { appInfoSchema } from './schemas'

export type AppInfo = z.infer<typeof appInfoSchema>

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export interface LaborApi {
  getAppInfo(): Promise<AppInfo>
}
