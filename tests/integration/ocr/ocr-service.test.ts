import { afterEach, describe, expect, it } from 'vitest'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recognizeImage } from '../../../src/main/ocr/ocr-service'

const temporaryFiles: string[] = []
const fixture = (name: string) => join(process.cwd(), 'tests', 'fixtures', 'ocr', name)

async function copyToTemporaryImage(source: string, extension: string): Promise<string> {
  const path = join(tmpdir(), `labor-ocr-${crypto.randomUUID()}.${extension}`)
  temporaryFiles.push(path)
  await writeFile(path, await readFile(fixture(source)))
  return path
}

afterEach(async () => {
  await Promise.all(temporaryFiles.splice(0).map(path => rm(path, { force: true })))
})

describe('recognizeImage', () => {
  it('recognizes Simplified Chinese package text with local model data', async () => {
    const { extractEntityCandidates } = await import('../../../src/main/identity/candidate-extractor')
    const path = await copyToTemporaryImage('package-label.png', 'png')
    const result = await recognizeImage(path, new AbortController().signal)
    expect(result.text.replace(/\s/gu, '')).toContain('生产企业')
    expect(extractEntityCandidates(result.text).map(({ name, role }) => ({ name, role }))).toContainEqual({ name: '深圳先进制造有限公司', role: 'manufacturer' })
    expect(result.lines.length).toBeGreaterThan(0)
    expect(result.lines.every(line => line.confidence >= 0 && line.confidence <= 100)).toBe(true)
    expect(result.words.every(word => word.confidence >= 0 && word.confidence <= 100)).toBe(true)
    expect(result).not.toHaveProperty('imagePath')
    expect(result).not.toHaveProperty('imageBytes')
  })

  it.each([
    ['PNG', 'package-label.png', 'png'],
    ['JPEG', 'package-label.jpg', 'jpg'],
    ['WebP', 'package-label.webp', 'webp']
  ])('accepts a correctly signed %s image', async (_label, fixtureName, extension) => {
    const path = await copyToTemporaryImage(fixtureName, extension)
    await expect(recognizeImage(path, new AbortController().signal)).resolves.toMatchObject({ text: expect.any(String) })
  })

  it('rejects unsupported file types and mismatched extensions', async () => {
    const path = await copyToTemporaryImage('package-label.png', 'jpg')
    await expect(recognizeImage(path, new AbortController().signal)).rejects.toMatchObject({ code: 'invalid-image' })
  })

  it('rejects files larger than 20 MiB before OCR', async () => {
    const path = await copyToTemporaryImage('package-label.png', 'png')
    await writeFile(path, Buffer.alloc(20 * 1024 * 1024 + 1))
    await expect(recognizeImage(path, new AbortController().signal)).rejects.toMatchObject({ code: 'image-too-large' })
  })

  it('reports unreadable paths without leaking the path', async () => {
    const path = join(tmpdir(), `does-not-exist-${crypto.randomUUID()}.png`)
    await expect(recognizeImage(path, new AbortController().signal)).rejects.toMatchObject({ code: 'unreadable-image' })
  })

  it('honors cancellation before OCR begins', async () => {
    const path = await copyToTemporaryImage('package-label.png', 'png')
    const controller = new AbortController()
    controller.abort()
    await expect(recognizeImage(path, controller.signal)).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('returns editable label-free text marked for review without persisting screenshot identifiers', async () => {
    const { createImageHandlers } = await import('../../../src/main/ipc/register-ipc')
    const path = await copyToTemporaryImage('no-company.png', 'png')
    const textResult = await recognizeImage(path, new AbortController().signal)
    const handlers = createImageHandlers({
      pickImage: async () => path,
      recognize: async () => textResult
    })
    const result = await handlers['image:pick-and-recognize']({})
    expect(result).toMatchObject({ ok: true, value: { rawText: expect.stringContaining('净'), candidates: [], needsReview: true } })
    expect(JSON.stringify(result)).not.toContain(path)
  })
})

describe('image OCR IPC handlers', () => {
  it('keeps raw low-confidence text editable and requires review when no labeled entity exists', async () => {
    const { createImageHandlers } = await import('../../../src/main/ipc/register-ipc')
    const handlers = createImageHandlers({
      pickImage: async () => 'C:\\private\\package.png',
      recognize: async () => ({ text: '本品净含量：500 克', confidence: 42, lines: [], words: [] })
    })
    const result = await handlers['image:pick-and-recognize']({})
    expect(result).toEqual({
      ok: true,
      value: { rawText: '本品净含量：500 克', confidence: 42, lines: [], words: [], candidates: [], needsReview: true }
    })
    expect(JSON.stringify(result)).not.toContain('C:\\private')
    expect(handlers).not.toHaveProperty('search')
  })

  it('returns picker cancellation as a result without calling OCR', async () => {
    const { createImageHandlers } = await import('../../../src/main/ipc/register-ipc')
    let calls = 0
    const handlers = createImageHandlers({
      pickImage: async () => undefined,
      recognize: async () => { calls += 1; return { text: '', confidence: 0, lines: [], words: [] } }
    })
    await expect(handlers['image:pick-and-recognize']({})).resolves.toEqual({ ok: false, error: 'picker-cancelled' })
    expect(calls).toBe(0)
  })

  it('cancels an active OCR operation through the fixed cancel capability', async () => {
    const { createImageHandlers } = await import('../../../src/main/ipc/register-ipc')
    let operationSignal: AbortSignal | undefined
    const handlers = createImageHandlers({
      pickImage: async () => 'C:\\private\\package.png',
      recognize: async (_path, signal) => {
        operationSignal = signal
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error(), { code: 'cancelled' })), { once: true }))
      }
    })
    const pending = handlers['image:pick-and-recognize']({})
    await Promise.resolve()
    await handlers['image:cancel']({})
    await expect(pending).resolves.toEqual({ ok: false, error: 'cancelled' })
    expect(operationSignal?.aborted).toBe(true)
  })
})


describe('OCR worker lifecycle', () => {
  it('reuses one lazy worker, emits progress, and terminates it on shutdown', async () => {
    const { createOcrService } = await import('../../../src/main/ocr/ocr-service')
    const path = await copyToTemporaryImage('package-label.png', 'png')
    let created = 0
    let terminated = 0
    const progress: unknown[] = []
    const service = createOcrService(undefined, async logger => {
      created += 1
      return {
        async recognize() {
          logger({ status: 'recognizing text', progress: 0.5 })
          return { data: { text: 'local text', confidence: 90, lines: [], words: [] } }
        },
        async terminate() { terminated += 1 }
      }
    })
    await service.recognizeImage(path, new AbortController().signal, message => progress.push(message))
    await service.recognizeImage(path, new AbortController().signal)
    expect(created).toBe(1)
    expect(progress).toEqual([{ status: 'recognizing text', progress: 0.5 }])
    expect(terminated).toBe(0)
    await service.shutdown()
    expect(terminated).toBe(1)
  })

  it('terminates the active worker when OCR is cancelled', async () => {
    const { createOcrService } = await import('../../../src/main/ocr/ocr-service')
    const path = await copyToTemporaryImage('package-label.png', 'png')
    let started!: () => void
    let terminated = 0
    const recognitionStarted = new Promise<void>(resolve => { started = resolve })
    const service = createOcrService(undefined, async () => ({
      recognize() {
        started()
        return new Promise(() => {})
      },
      async terminate() { terminated += 1 }
    }))
    const controller = new AbortController()
    const pending = service.recognizeImage(path, controller.signal)
    await recognitionStarted
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
    expect(terminated).toBe(1)
  })

  it('reports cancellation when worker termination rejects recognition first', async () => {
    const { createOcrService } = await import('../../../src/main/ocr/ocr-service')
    const path = await copyToTemporaryImage('package-label.png', 'png')
    let started!: () => void
    let rejectRecognition!: (error: Error) => void
    const recognitionStarted = new Promise<void>(resolve => { started = resolve })
    const service = createOcrService(undefined, async () => ({
      recognize() {
        return new Promise((_resolve, reject) => {
          rejectRecognition = reject
          started()
        })
      },
      async terminate() { rejectRecognition(new Error('worker terminated')) }
    }))
    const controller = new AbortController()
    const pending = service.recognizeImage(path, controller.signal)
    await recognitionStarted
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('keeps genuine non-abort recognition failures as OCR failures', async () => {
    const { createOcrService } = await import('../../../src/main/ocr/ocr-service')
    const path = await copyToTemporaryImage('package-label.png', 'png')
    const service = createOcrService(undefined, async () => ({
      async recognize() { throw new Error('recognition failed') },
      async terminate() {}
    }))
    await expect(service.recognizeImage(path, new AbortController().signal)).rejects.toMatchObject({ code: 'ocr-failed' })
    await service.shutdown()
  })

  it('rejects bytes that do not match an allowed image signature', async () => {
    const path = join(tmpdir(), `labor-ocr-invalid-${crypto.randomUUID()}.png`)
    temporaryFiles.push(path)
    await writeFile(path, 'not an image')
    await expect(recognizeImage(path, new AbortController().signal)).rejects.toMatchObject({ code: 'invalid-image' })
  })
})
