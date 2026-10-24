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
    expect(Object.keys(api)).toEqual(['getAppInfo', 'history', 'settings'])
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
