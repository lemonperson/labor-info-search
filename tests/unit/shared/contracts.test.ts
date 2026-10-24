import { describe, expect, it } from 'vitest'

// These tests catch a widened IPC contract or missing validation in the preload bridge.
describe('app-info IPC contract', () => {
  it('accepts the Windows app identity', async () => {
    const { appInfoSchema } = await import('../../../src/shared/schemas')
    expect(appInfoSchema.parse({ name: '劳动信息检索', version: '0.1.0', platform: 'win32' })).toEqual({
      name: '劳动信息检索', version: '0.1.0', platform: 'win32'
    })
  })

  it('rejects malformed responses', async () => {
    const { appInfoSchema } = await import('../../../src/shared/schemas')
    for (const payload of [null, {}, { name: 'Other', version: '0.1.0', platform: 'win32' },
      { name: '劳动信息检索', version: 1, platform: 'win32' },
      { name: '劳动信息检索', version: '', platform: 'win32' },
      { name: '劳动信息检索', version: '0.1.0', platform: 'linux' },
      { name: '劳动信息检索', version: '0.1.0', platform: 'win32', extra: true }]) {
      expect(appInfoSchema.safeParse(payload).success).toBe(false)
    }
  })

  it('accepts only an empty request object', async () => {
    const { appInfoRequestSchema } = await import('../../../src/shared/schemas')
    expect(appInfoRequestSchema.parse({})).toEqual({})
    for (const payload of [null, undefined, 'app:get-info', [], { extra: true }]) {
      expect(appInfoRequestSchema.safeParse(payload).success).toBe(false)
    }
  })

  it('validates app-info responses alongside fixed storage capabilities', async () => {
    const { createLaborApi } = await import('../../../src/shared/contracts')
    const requests: unknown[][] = []
    const api = createLaborApi(async (...args) => {
      requests.push(args)
      return { name: '劳动信息检索', version: '0.1.0', platform: 'win32' }
    })
    expect(Object.keys(api)).toEqual(['getAppInfo', 'history', 'settings', 'image'])
    await expect(api.getAppInfo()).resolves.toEqual({ name: '劳动信息检索', version: '0.1.0', platform: 'win32' })
    expect(requests).toEqual([['app:get-info', {}]])
    await expect(createLaborApi(async () => ({ name: 'spoofed' })).getAppInfo()).rejects.toThrow()
  })
})

// Catches bypassing request validation or returning unchecked main-process data.
describe('main IPC boundary', () => {
  it('validates both incoming requests and outgoing app info', async () => {
    const { createAppInfoHandler } = await import('../../../src/shared/contracts')
    let calls = 0
    const handle = createAppInfoHandler(() => {
      calls += 1
      return { name: '劳动信息检索', version: '0.1.0', platform: 'win32' }
    })
    expect(() => handle({ extra: true })).toThrow()
    expect(calls).toBe(0)
    expect(handle({})).toEqual({ name: '劳动信息检索', version: '0.1.0', platform: 'win32' })
    expect(calls).toBe(1)
    expect(() => createAppInfoHandler(() => ({ name: 'spoofed' }))({})).toThrow()
  })
})

describe('image OCR preload contract', () => {
  it('exposes only fixed image-pick and cancel capabilities with validated results', async () => {
    const { createLaborApi } = await import('../../../src/shared/contracts')
    const requests: unknown[][] = []
    const api = createLaborApi(async (...args) => {
      requests.push(args)
      if (args[0] === 'image:pick-and-recognize') {
        return { ok: true, value: { rawText: '生产企业：示例制造有限公司', confidence: 94, lines: [], words: [], candidates: [], needsReview: false } }
      }
      if (args[0] === 'image:cancel') return null
      throw new Error('unexpected capability')
    })
    expect(Object.keys(api.image)).toEqual(['pickAndRecognize', 'cancel', 'onProgress'])
    await expect(api.image.pickAndRecognize()).resolves.toMatchObject({ ok: true, value: { rawText: expect.any(String) } })
    await expect(api.image.cancel()).resolves.toBeNull()
    expect(requests).toEqual([
      ['image:pick-and-recognize', {}],
      ['image:cancel', {}]
    ])
  })

  it('rejects a response that tries to return a screenshot path', async () => {
    const { createLaborApi } = await import('../../../src/shared/contracts')
    const api = createLaborApi(async () => ({
      ok: true,
      value: { rawText: '示例', confidence: 90, lines: [], words: [], candidates: [], needsReview: false, imagePath: 'C:\\private\\input.png' }
    }))
    await expect(api.image.pickAndRecognize()).rejects.toThrow()
  })
})



describe('image OCR progress bridge', () => {
  it('validates progress payloads and unsubscribes the listener', async () => {
    const { createLaborApi } = await import('../../../src/shared/contracts')
    let publish: ((payload: unknown) => void) | undefined
    let unsubscribed = false
    const api = createLaborApi(async () => null, (_channel, listener) => {
      publish = listener
      return () => { unsubscribed = true }
    })
    const received: unknown[] = []
    const unsubscribe = api.image.onProgress(progress => received.push(progress))
    publish?.({ status: 'recognizing text', progress: 0.5 })
    publish?.({ status: 'bad progress', progress: 2 })
    expect(received).toEqual([{ status: 'recognizing text', progress: 0.5 }])
    unsubscribe()
    expect(unsubscribed).toBe(true)
  })
})
