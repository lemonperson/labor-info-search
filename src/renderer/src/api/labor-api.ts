import type { LaborApi } from '../../../shared/types'

declare global {
  interface Window {
    readonly laborApi: LaborApi
  }
}

export const laborApi: LaborApi = {
  // Async wrappers turn a missing preload into a safe renderer error state.
  getAppInfo: async () => window.laborApi.getAppInfo(),
  history: {
    list: async limit => window.laborApi.history.list(limit),
    get: async id => window.laborApi.history.get(id),
    delete: async id => window.laborApi.history.delete(id),
    clear: async () => window.laborApi.history.clear()
  },
  settings: {
    get: async () => window.laborApi.settings.get(),
    update: async patch => window.laborApi.settings.update(patch)
  },
  image: {
    pickAndRecognize: async () => window.laborApi.image.pickAndRecognize(),
    cancel: async () => window.laborApi.image.cancel(),
    onProgress: listener => window.laborApi.image.onProgress(listener)
  }
}
