import type { BrowserWindow } from 'electron'
import { marketplaceResolveRequestSchema, ocrProgressSchema, ocrRequestSchema, ocrResultSchema, productResolutionSchema, storageMutationResponseSchema } from '../../shared/schemas'
import type { OcrProgress, Result } from '../../shared/types'
import { extractEntityCandidates } from '../identity/candidate-extractor'
import { recognizeImage, type OcrTextResult } from '../ocr/ocr-service'
import { resolveProductLink } from '../marketplace/link-resolver'
import type { ProductResolution, SessionProgress } from '../../shared/types'
import { searchProgressSchema, searchSessionSchema, searchStartRequestSchema, searchCancelRequestSchema } from '../../shared/schemas'
import type { SearchSessionService } from '../search/search-session-service'

const pickChannel = 'image:pick-and-recognize' as const
const cancelChannel = 'image:cancel' as const
const progressChannel = 'image:progress' as const

type ImageHandlerDependencies = {
  pickImage(): Promise<string | undefined>
  recognize(path: string, signal: AbortSignal, onProgress?: (progress: OcrProgress) => void): Promise<OcrTextResult>
  sendProgress?(progress: OcrProgress): void
}

type ImageHandlers = Record<typeof pickChannel | typeof cancelChannel, (payload: unknown) => unknown>

export function createImageHandlers(dependencies: ImageHandlerDependencies): ImageHandlers {
  let activeController: AbortController | undefined

  return {
    async [pickChannel](payload) {
      ocrRequestSchema.parse(payload)
      if (activeController) return { ok: false, error: 'ocr-failed' } satisfies Result<never, 'ocr-failed'>
      let path: string | undefined
      try {
        path = await dependencies.pickImage()
      } catch {
        return { ok: false, error: 'picker-cancelled' }
      }
      if (!path) return { ok: false, error: 'picker-cancelled' }

      const controller = new AbortController()
      activeController = controller
      try {
        const recognized = await dependencies.recognize(path, controller.signal, (progress) => {
          const parsed = ocrProgressSchema.safeParse(progress)
          if (parsed.success) dependencies.sendProgress?.(parsed.data)
        })
        const candidates = extractEntityCandidates(recognized.text)
        return ocrResultSchema.parse({
          ok: true,
          value: {
            rawText: recognized.text,
            confidence: recognized.confidence,
            lines: recognized.lines,
            words: recognized.words,
            candidates,
            needsReview: recognized.confidence < 75 || candidates.length === 0
          }
        })
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : undefined
        const allowed = ['cancelled', 'invalid-image', 'image-too-large', 'unreadable-image', 'ocr-failed']
        return { ok: false, error: allowed.includes(String(code)) ? code : 'ocr-failed' }
      } finally {
        if (activeController === controller) activeController = undefined
      }
    },
    async [cancelChannel](payload) {
      ocrRequestSchema.parse(payload)
      activeController?.abort()
      return null
    }
  }
}

export async function registerImageIpc(getWindow: () => BrowserWindow | null): Promise<void> {
  const { dialog, ipcMain } = await import('electron')
  const handlers = createImageHandlers({
    async pickImage() {
      const window = getWindow()
      if (!window) return undefined
      const result = await dialog.showOpenDialog(window, {
        title: '选择商品包装或详情截图',
        properties: ['openFile'],
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      })
      return result.canceled ? undefined : result.filePaths[0]
    },
    recognize: recognizeImage,
    sendProgress(progress) {
      getWindow()?.webContents.send(progressChannel, progress)
    }
  })

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, createSenderCheckedHandler(getWindow, handler))
  }
}

const marketplaceResolveChannel = 'marketplace:resolve' as const
const marketplaceCancelChannel = 'marketplace:cancel' as const
type MarketplaceHandlerDependencies = {
  resolve(url: string, signal: AbortSignal): Promise<ProductResolution>
}

export function createMarketplaceHandlers(dependencies: MarketplaceHandlerDependencies = { resolve: resolveProductLink }) {
  let activeController: AbortController | undefined
  return {
    async [marketplaceResolveChannel](payload: unknown) {
      const { rawUrl } = marketplaceResolveRequestSchema.parse(payload)
      if (activeController) activeController.abort()
      const controller = new AbortController()
      activeController = controller
      try {
        return productResolutionSchema.parse(await dependencies.resolve(rawUrl, controller.signal))
      } finally {
        if (activeController === controller) activeController = undefined
      }
    },
    async [marketplaceCancelChannel](payload: unknown) {
      ocrRequestSchema.parse(payload)
      activeController?.abort()
      return storageMutationResponseSchema.parse(null)
    }
  }
}

export async function registerMarketplaceIpc(getWindow: () => BrowserWindow | null): Promise<void> {
  const { ipcMain } = await import('electron')
  const handlers = createMarketplaceHandlers()
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, createSenderCheckedHandler(getWindow, handler))
  }
}


export function createSenderCheckedHandler<T>(getWindow: () => BrowserWindow | null, handler: (payload: unknown) => T | Promise<T>) {
  return (event: { sender: BrowserWindow['webContents']; senderFrame: BrowserWindow['webContents']['mainFrame'] | null }, payload: unknown) => {
    const window = getWindow()
    if (!window || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Untrusted IPC sender')
    }
    return handler(payload)
  }
}
const searchStartChannel = 'search:start' as const
const searchCancelSearchChannel = 'search:cancel' as const
const searchProgressChannel = 'search:progress' as const

export function createSearchHandlers(service: SearchSessionService, sendProgress?: (progress: SessionProgress) => void) {
  return {
    async [searchStartChannel](payload: unknown) {
      const request = searchStartRequestSchema.parse(payload)
      const session = await service.start(request.confirmedSubject, progress => {
        const parsed = searchProgressSchema.safeParse(progress)
        if (parsed.success) sendProgress?.(parsed.data)
      }, request.sessionId)
      return searchSessionSchema.parse(session)
    },
    async [searchCancelSearchChannel](payload: unknown) {
      const { sessionId } = searchCancelRequestSchema.parse(payload)
      await service.cancel(sessionId)
      return storageMutationResponseSchema.parse(null)
    }
  }
}

export async function registerSearchIpc(getWindow: () => BrowserWindow | null, service: SearchSessionService): Promise<void> {
  const { ipcMain } = await import('electron')
  const handlers = createSearchHandlers(service, progress => getWindow()?.webContents.send(searchProgressChannel, progress))
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, createSenderCheckedHandler(getWindow, handler))
  }
}
