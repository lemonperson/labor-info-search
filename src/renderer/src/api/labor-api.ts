import type { LaborApi } from '../../../shared/types'

declare global {
  interface Window {
    readonly laborApi: LaborApi
  }
}

export const laborApi: LaborApi = {
  // An async wrapper turns a missing preload into the renderer's safe error state.
  getAppInfo: async () => window.laborApi.getAppInfo()
}
