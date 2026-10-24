import { createWorker } from 'tesseract.js'
import { readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import type { OcrProgress, OcrTextLine, OcrTextWord } from '../../shared/types'

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export type OcrTextResult = {
  text: string
  confidence: number
  lines: OcrTextLine[]
  words: OcrTextWord[]
}

export type OcrFailureCode = 'cancelled' | 'invalid-image' | 'image-too-large' | 'unreadable-image' | 'ocr-failed'

export class OcrServiceError extends Error {
  constructor(readonly code: OcrFailureCode) {
    super(code)
    this.name = 'OcrServiceError'
  }
}

type WorkerResult = {
  data: {
    text?: string
    confidence?: number
    lines?: Array<{ text?: string; confidence?: number; words?: Array<{ text?: string; confidence?: number }> }>
    words?: Array<{ text?: string; confidence?: number }>
    blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ text?: string; confidence?: number; words?: Array<{ text?: string; confidence?: number }> }> }> }>
  }
}

type OcrWorker = {
  recognize(image: Buffer, options?: object, output?: { blocks?: boolean }): Promise<WorkerResult>
  terminate(): Promise<unknown>
}
type WorkerFactory = (logger: (message: { status?: string; progress?: number }) => void) => Promise<OcrWorker>
type ProgressListener = (progress: OcrProgress) => void

let defaultModelDirectory = join(process.cwd(), 'resources', 'ocr')

function detectImageFormat(image: Uint8Array): 'png' | 'jpg' | 'webp' | undefined {
  if (image.length >= 8 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47
    && image[4] === 0x0d && image[5] === 0x0a && image[6] === 0x1a && image[7] === 0x0a) return 'png'
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'jpg'
  if (image.length >= 12 && String.fromCharCode(...image.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...image.subarray(8, 12)) === 'WEBP') return 'webp'
  return undefined
}

function confidence(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

function normalizeResult(data: WorkerResult['data']): OcrTextResult {
  const blocks = data.blocks ?? []
  const lines = data.lines ?? blocks.flatMap(block => block.paragraphs?.flatMap(paragraph => paragraph.lines ?? []) ?? [])
  const words = data.words ?? lines.flatMap(line => line.words ?? [])
  return {
    text: (data.text ?? '').slice(0, 50000),
    confidence: confidence(data.confidence ?? (lines.length ? lines.reduce((sum, line) => sum + confidence(line.confidence), 0) / lines.length : 0)),
    lines: lines.slice(0, 1000).map(line => ({ text: (line.text ?? '').slice(0, 2000), confidence: confidence(line.confidence) })),
    words: words.slice(0, 10000).map(word => ({ text: (word.text ?? '').slice(0, 500), confidence: confidence(word.confidence) }))
  }
}

export function createOcrService(modelDirectory?: string, workerFactory?: WorkerFactory) {
  const createWorkerInstance = workerFactory ?? ((logger) => createWorker('chi_sim', 1, {
    langPath: modelDirectory ?? defaultModelDirectory,
    gzip: true,
    cacheMethod: 'none',
    logger
  }))
  let workerPromise: Promise<OcrWorker> | undefined
  let currentProgress: ProgressListener | undefined
  let queue = Promise.resolve()

  function getWorker(): Promise<OcrWorker> {
    if (!workerPromise) {
      const creating = createWorkerInstance((message) => {
        const progress = message.progress
        if (currentProgress && typeof progress === 'number' && Number.isFinite(progress)) {
          currentProgress({ status: message.status?.slice(0, 80) || 'processing', progress: Math.max(0, Math.min(1, progress)) })
        }
      }).then(worker => worker as unknown as OcrWorker).catch((error: unknown) => {
        if (workerPromise === creating) workerPromise = undefined
        throw error
      })
      workerPromise = creating
    }
    return workerPromise
  }

  async function terminateWorker(expected?: OcrWorker): Promise<void> {
    const pending = workerPromise
    workerPromise = undefined
    if (!pending) return
    try {
      const worker = await pending
      if (!expected || worker === expected) await worker.terminate()
      else if (!workerPromise) workerPromise = pending
    } catch {
      // A failed worker initialization is already unusable and can be retried later.
    }
  }

  async function recognizeImage(imagePath: string, signal: AbortSignal, onProgress?: ProgressListener): Promise<OcrTextResult> {
    const task = queue.then(async () => {
      if (signal.aborted) throw new OcrServiceError('cancelled')
      let image: Buffer
      try {
        const metadata = await stat(imagePath)
        if (!metadata.isFile()) throw new OcrServiceError('unreadable-image')
        if (metadata.size > MAX_IMAGE_BYTES) throw new OcrServiceError('image-too-large')
        image = await readFile(imagePath)
      } catch (error) {
        if (error instanceof OcrServiceError) throw error
        throw new OcrServiceError('unreadable-image')
      }
      if (image.length > MAX_IMAGE_BYTES) throw new OcrServiceError('image-too-large')
      const format = detectImageFormat(image)
      const extension = extname(imagePath).toLocaleLowerCase()
      const expectedExtension = extension === '.jpeg' ? 'jpg' : extension.slice(1)
      if (!format || !['png', 'jpg', 'webp'].includes(expectedExtension) || format !== expectedExtension) {
        throw new OcrServiceError('invalid-image')
      }

      currentProgress = onProgress
      let worker: OcrWorker
      try {
        worker = await getWorker()
      } catch {
        throw new OcrServiceError('ocr-failed')
      }
      if (signal.aborted) {
        await terminateWorker(worker)
        currentProgress = undefined
        throw new OcrServiceError('cancelled')
      }

      let abortHandler: (() => void) | undefined
      const cancelled = new Promise<never>((_resolve, reject) => {
        abortHandler = () => {
          void terminateWorker(worker).finally(() => reject(new OcrServiceError('cancelled')))
        }
        signal.addEventListener('abort', abortHandler, { once: true })
      })
      try {
        const result = await Promise.race([worker.recognize(image, {}, { blocks: true }), cancelled])
        if (signal.aborted) throw new OcrServiceError('cancelled')
        return normalizeResult(result.data)
      } catch (error) {
        if (error instanceof OcrServiceError) throw error
        throw new OcrServiceError('ocr-failed')
      } finally {
        if (abortHandler) signal.removeEventListener('abort', abortHandler)
        currentProgress = undefined
      }
    })
    queue = task.then(() => undefined, () => undefined)
    return task
  }

  return { recognizeImage, shutdown: () => terminateWorker() }
}

const localOcr = createOcrService()
export const recognizeImage = localOcr.recognizeImage
export const shutdownOcrWorker = localOcr.shutdown
export function configureOcrModelDirectory(directory: string): void {
  defaultModelDirectory = directory
}
