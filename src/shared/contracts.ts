import { appInfoRequestSchema, appInfoSchema } from './schemas'
import type { AppInfo, LaborApi } from './types'

export const appInfoContract = {
  channel: 'app:get-info',
  request: appInfoRequestSchema,
  response: appInfoSchema
} as const

type InvokeAppInfo = (channel: typeof appInfoContract.channel, request: Record<string, never>) => Promise<unknown>

// This is the complete renderer-facing capability set; never expose ipcRenderer itself.
export function createLaborApi(invoke: InvokeAppInfo): LaborApi {
  return Object.freeze({
    async getAppInfo() {
      const request = appInfoContract.request.parse({})
      return appInfoContract.response.parse(await invoke(appInfoContract.channel, request))
    }
  })
}

export function createAppInfoHandler(readAppInfo: () => unknown): (payload: unknown) => AppInfo {
  return payload => {
    appInfoContract.request.parse(payload)
    return appInfoContract.response.parse(readAppInfo())
  }
}
