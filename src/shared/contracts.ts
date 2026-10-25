import { z } from 'zod'
import {
  appInfoRequestSchema, appInfoSchema, appSettingsSchema, historyGetResponseSchema,
  historyIdRequestSchema, historyListRequestSchema, historyListResponseSchema, settingsPatchSchema,
  storageEmptyRequestSchema, storageMutationResponseSchema, ocrProgressSchema, ocrRequestSchema, ocrResultSchema, searchProgressSchema, searchSessionSchema, searchStartRequestSchema, searchCancelRequestSchema, searchSessionIdSchema,
  marketplaceResolveRequestSchema, productResolutionSchema, browserFallbackPreviewRequestSchema,
  browserFallbackPreviewSchema, browserOpenConfirmedRequestSchema, browserOpenResponseSchema,
  sourcePreviewRequestSchema, sourcePreviewResponseSchema
} from './schemas'
import type { AppInfo, AppSettings, LaborApi, OcrProgress, SessionProgress, ConfirmedSubjectInput, SearchQuery } from './types'

export const appInfoContract = {
  channel: 'app:get-info', request: appInfoRequestSchema, response: appInfoSchema
} as const

export const storageContracts = {
  'history:list': { request: historyListRequestSchema, response: historyListResponseSchema },
  'history:get': { request: historyIdRequestSchema, response: historyGetResponseSchema },
  'history:delete': { request: historyIdRequestSchema, response: storageMutationResponseSchema },
  'history:clear': { request: storageEmptyRequestSchema, response: storageMutationResponseSchema },
  'settings:get': { request: storageEmptyRequestSchema, response: appSettingsSchema },
  'settings:update': { request: settingsPatchSchema, response: appSettingsSchema }
} as const

const imageContracts = {
  'image:pick-and-recognize': { request: ocrRequestSchema, response: ocrResultSchema },
  'image:cancel': { request: ocrRequestSchema, response: storageMutationResponseSchema }
} as const

const searchContracts = {
  'search:start': { request: searchStartRequestSchema, response: searchSessionSchema },
  'search:cancel': { request: searchCancelRequestSchema, response: storageMutationResponseSchema }
} as const

const marketplaceContracts = {
  'marketplace:resolve': { request: marketplaceResolveRequestSchema, response: productResolutionSchema },
  'marketplace:cancel': { request: ocrRequestSchema, response: storageMutationResponseSchema }
} as const

type StorageChannel = keyof typeof storageContracts
type ImageChannel = keyof typeof imageContracts
type MarketplaceChannel = keyof typeof marketplaceContracts
type SearchChannel = keyof typeof searchContracts
const browserContracts = {
  'source:preview': { request: sourcePreviewRequestSchema, response: sourcePreviewResponseSchema },
  'source:open-confirmed': { request: browserOpenConfirmedRequestSchema, response: browserOpenResponseSchema },
  'browser:preview': { request: browserFallbackPreviewRequestSchema, response: browserFallbackPreviewSchema },
  'browser:open-confirmed': { request: browserOpenConfirmedRequestSchema, response: browserOpenResponseSchema }
} as const
type BrowserChannel = keyof typeof browserContracts
const recoveryContract = {
  'recovery:show-data-folder': { request: storageEmptyRequestSchema, response: storageMutationResponseSchema },
  'recovery:restart': { request: storageEmptyRequestSchema, response: storageMutationResponseSchema }
} as const
type RecoveryChannel = keyof typeof recoveryContract
type InvokeLabor = (channel: typeof appInfoContract.channel | StorageChannel | ImageChannel | MarketplaceChannel | SearchChannel | BrowserChannel | RecoveryChannel, request: unknown) => Promise<unknown>
type Subscribe = (channel: 'image:progress' | 'search:progress', listener: (payload: unknown) => void) => () => void

// The renderer receives only fixed capabilities, never raw IPC or database access.
export function createLaborApi(invoke: InvokeLabor, subscribe: Subscribe = () => () => {}) : LaborApi {
  async function call<C extends StorageChannel>(channel: C, input: unknown): Promise<z.output<(typeof storageContracts)[C]['response']>> {
    const contract = storageContracts[channel]
    const request = contract.request.parse(input)
    return contract.response.parse(await invoke(channel, request)) as z.output<(typeof storageContracts)[C]['response']>
  }
  return Object.freeze({
    async getAppInfo() {
      const request = appInfoContract.request.parse({})
      return appInfoContract.response.parse(await invoke(appInfoContract.channel, request))
    },
    recovery: Object.freeze({
      async showDataFolder() {
        const request = recoveryContract['recovery:show-data-folder'].request.parse({})
        return recoveryContract['recovery:show-data-folder'].response.parse(await invoke('recovery:show-data-folder', request))
      },
      async restart() {
        const request = recoveryContract['recovery:restart'].request.parse({})
        return recoveryContract['recovery:restart'].response.parse(await invoke('recovery:restart', request))
      }
    }),
    history: Object.freeze({
      list: (limit = 50) => call('history:list', { limit }),
      get: (id: string) => call('history:get', { id }),
      delete: (id: string) => call('history:delete', { id }),
      clear: () => call('history:clear', {})
    }),
    settings: Object.freeze({
      get: () => call('settings:get', {}),
      update: (patch: Partial<AppSettings>) => call('settings:update', patch)
    }),
    search: Object.freeze({
      async start(confirmedSubject: ConfirmedSubjectInput, sessionId: string) {
        const request = searchContracts['search:start'].request.parse({ confirmedSubject, sessionId })
        return searchContracts['search:start'].response.parse(await invoke('search:start', request))
      },
      async cancel(sessionId: string) {
        const request = searchContracts['search:cancel'].request.parse({ sessionId })
        return searchContracts['search:cancel'].response.parse(await invoke('search:cancel', request))
      },
      onProgress(sessionId: string, listener: (progress: SessionProgress) => void) {
        const selectedSessionId = searchSessionIdSchema.parse(sessionId)
        return subscribe('search:progress', (payload) => {
          const parsed = searchProgressSchema.safeParse(payload)
          if (parsed.success && parsed.data.sessionId === selectedSessionId) listener(parsed.data)
        })
      }
    }),
    image: Object.freeze({
      async pickAndRecognize() {
        const request = imageContracts['image:pick-and-recognize'].request.parse({})
        return imageContracts['image:pick-and-recognize'].response.parse(
          await invoke('image:pick-and-recognize', request)
        )
      },
      async cancel() {
        const request = imageContracts['image:cancel'].request.parse({})
        return imageContracts['image:cancel'].response.parse(await invoke('image:cancel', request))
      },
      onProgress(listener: (progress: OcrProgress) => void) {
        return subscribe('image:progress', (payload) => {
          const parsed = ocrProgressSchema.safeParse(payload)
          if (parsed.success) listener(parsed.data)
        })
      }
    }),
    marketplace: Object.freeze({
      async resolve(rawUrl: string) {
        const request = marketplaceContracts['marketplace:resolve'].request.parse({ rawUrl })
        return marketplaceContracts['marketplace:resolve'].response.parse(await invoke('marketplace:resolve', request))
      },
      async cancel() {
        const request = marketplaceContracts['marketplace:cancel'].request.parse({})
        return marketplaceContracts['marketplace:cancel'].response.parse(await invoke('marketplace:cancel', request))
      }
    }),
    browser: Object.freeze({
      async previewSource(sessionId: string, recordId: string) {
        const request = browserContracts['source:preview'].request.parse({ sessionId, recordId })
        return browserContracts['source:preview'].response.parse(await invoke('source:preview', request))
      },
      async openSourceConfirmed(previewId: string) {
        const request = browserContracts['source:open-confirmed'].request.parse({ previewId })
        return browserContracts['source:open-confirmed'].response.parse(await invoke('source:open-confirmed', request))
      },
      async preview(provider: 'bing', reason: string, queries: SearchQuery[]) {
        const request = browserContracts['browser:preview'].request.parse({ provider, reason, queries })
        return browserContracts['browser:preview'].response.parse(await invoke('browser:preview', request))
      },
      async openConfirmed(previewId: string) {
        const request = browserContracts['browser:open-confirmed'].request.parse({ previewId })
        return browserContracts['browser:open-confirmed'].response.parse(await invoke('browser:open-confirmed', request))
      }
    })
  })
}

export function createAppInfoHandler(readAppInfo: () => unknown): (payload: unknown) => AppInfo {
  return payload => {
    appInfoContract.request.parse(payload)
    return appInfoContract.response.parse(readAppInfo())
  }
}

interface StorageOperations {
  listSessions(limit: number): unknown
  getSession(id: string): unknown
  deleteSession(id: string): void
  clearAll(): void
  getSettings(): unknown
  updateSettings(patch: Partial<AppSettings>): unknown
}

export function createStorageHandlers(operations: StorageOperations): Record<StorageChannel, (payload: unknown) => unknown> {
  function handler<C extends StorageChannel>(channel: C, operation: (request: z.output<(typeof storageContracts)[C]['request']>) => unknown) {
    return (payload: unknown): unknown => {
      const request = storageContracts[channel].request.parse(payload) as z.output<(typeof storageContracts)[C]['request']>
      return storageContracts[channel].response.parse(operation(request))
    }
  }
  return {
    'history:list': handler('history:list', ({ limit }) => operations.listSessions(limit)),
    'history:get': handler('history:get', ({ id }) => operations.getSession(id)),
    'history:delete': handler('history:delete', ({ id }) => { operations.deleteSession(id); return null }),
    'history:clear': handler('history:clear', () => { operations.clearAll(); return null }),
    'settings:get': handler('settings:get', () => operations.getSettings()),
    'settings:update': handler('settings:update', patch => operations.updateSettings(patch))
  }
}
