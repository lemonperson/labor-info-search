import { describe, expect, it } from 'vitest'
import type { ConfirmedSubjectInput } from '../../../src/shared/types'

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
    expect(Object.keys(api)).toEqual(['getAppInfo', 'recovery', 'history', 'settings', 'search', 'image', 'marketplace', 'browser'])
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

describe('marketplace resolver preload contract', () => {
  it('validates URL requests and bounded resolver responses through the narrow capability', async () => {
    const { createLaborApi } = await import('../../../src/shared/contracts')
    const requests: unknown[][] = []
    const result = { platform: 'jd', productTitle: '商品', finalUrl: 'https://item.jd.com/1.html', candidates: [], evidence: [], warnings: [], status: 'partial' }
    const api = createLaborApi(async (...args) => { requests.push(args); return args[0] === 'marketplace:resolve' ? result : null })
    await expect(api.marketplace.resolve('https://item.jd.com/1.html')).resolves.toEqual(result)
    await expect(api.marketplace.cancel()).resolves.toBeNull()
    expect(requests).toEqual([['marketplace:resolve', { rawUrl: 'https://item.jd.com/1.html' }], ['marketplace:cancel', {}]])
    await expect(api.marketplace.resolve('x'.repeat(2049))).rejects.toThrow()
    const invalid = createLaborApi(async () => ({ ...result, finalUrl: 'x'.repeat(2049) }))
    await expect(invalid.marketplace.resolve('https://item.jd.com/1.html')).rejects.toThrow()
  })
})

describe('confirmed search preload contract', () => {
  it('validates the confirmed input and response and removes disposed progress listeners', async () => {
    const { createLaborApi } = await import('../../../src/shared/contracts')
    const { session } = await import('../../integration/database/fixtures')
    const calls: unknown[][] = []
    let publish: ((payload: unknown) => void) | undefined
    let removed = false
    const api = createLaborApi(async (...args) => {
      calls.push(args)
      return args[0] === 'search:start' ? session() : null
    }, (channel, listener) => {
      expect(channel).toBe('search:progress')
      publish = listener
      return () => { removed = true }
    })
    const confirmed: ConfirmedSubjectInput = {
      subject: { id: 'subject-1', name: '示例制造有限公司', role: 'manufacturer', verification: 'user-confirmed', evidence: ['包装生产企业名称'] },
      selectedEvidence: ['包装生产企业名称'], verification: 'user-confirmed', origin: 'screenshot'
    }
    const sessionId = '8d4576e0-f8ad-44db-a42a-000000000001'
    await expect(api.search.start(confirmed, sessionId)).resolves.toMatchObject({ id: 'session-1' })
    await expect(api.search.cancel(sessionId)).resolves.toBeNull()
    await expect(api.search.start({ ...confirmed, verification: 'unverified' } as never, sessionId)).rejects.toThrow()
    expect(calls).toEqual([['search:start', { confirmedSubject: confirmed, sessionId }], ['search:cancel', { sessionId }]])
    const received: unknown[] = []
    const dispose = api.search.onProgress(sessionId, value => received.push(value))
    publish?.({ sessionId, phase: 'searching', completed: 1, total: 8 })
    publish?.({ sessionId, phase: 'searching', completed: 9, total: 8 })
    expect(received).toEqual([{ sessionId, phase: 'searching', completed: 1, total: 8 }])
    dispose()
    expect(removed).toBe(true)
  })
})

describe('search progress session isolation', () => {
  it('delivers each progress event only to the matching session listener and disposes independently', async () => {
    const { createLaborApi } = await import('../../../src/shared/contracts')
    const subscriptions = new Set<(payload: unknown) => void>()
    const api = createLaborApi(async () => null, (_channel, listener) => {
      subscriptions.add(listener)
      return () => { subscriptions.delete(listener) }
    })
    const receivedA: string[] = []
    const receivedB: string[] = []
    const subscribe = api.search.onProgress
    const disposeA = subscribe('8d4576e0-f8ad-44db-a42a-000000000001', event => receivedA.push(event.sessionId))
    const disposeB = subscribe('8d4576e0-f8ad-44db-a42a-000000000002', event => receivedB.push(event.sessionId))
    for (const listener of subscriptions) {
      listener({ sessionId: '8d4576e0-f8ad-44db-a42a-000000000001', phase: 'searching', completed: 1, total: 8 })
      listener({ sessionId: '8d4576e0-f8ad-44db-a42a-000000000002', phase: 'searching', completed: 1, total: 8 })
    }
    expect(receivedA).toEqual(['8d4576e0-f8ad-44db-a42a-000000000001'])
    expect(receivedB).toEqual(['8d4576e0-f8ad-44db-a42a-000000000002'])
    disposeA()
    expect(subscriptions).toHaveLength(1)
    disposeB()
    expect(subscriptions).toHaveLength(0)
  })
})
