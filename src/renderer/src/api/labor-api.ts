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
  search: {
    start: async (input, sessionId) => window.laborApi.search.start(input, sessionId),
    cancel: async sessionId => window.laborApi.search.cancel(sessionId),
    onProgress: (sessionId, listener) => window.laborApi.search.onProgress(sessionId, listener)
  },
  image: {
    pickAndRecognize: async () => window.laborApi.image.pickAndRecognize(),
    cancel: async () => window.laborApi.image.cancel(),
    onProgress: listener => window.laborApi.image.onProgress(listener)
  },
  marketplace: {
    resolve: rawUrl => window.laborApi.marketplace.resolve(rawUrl),
    cancel: async () => window.laborApi.marketplace.cancel()
  },
  browser: {
    preview: async (provider, reason, queries) => window.laborApi.browser.preview(provider, reason, queries),
    openConfirmed: async previewId => window.laborApi.browser.openConfirmed(previewId)
  }
}
