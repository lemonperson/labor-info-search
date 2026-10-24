import { describe, expect, it } from 'vitest'
import { createLaborApi, createStorageHandlers } from '../../../src/shared/contracts'
import { session } from '../../integration/database/fixtures'

const settings = { saveHistory: true, theme: 'system' as const, browserProvider: 'bing' as const }

describe('history and settings IPC capabilities', () => {
  it('exposes only fixed capabilities and validates requests before invoking', async () => {
    let calls = 0
    const api = createLaborApi(async () => { calls++; return [] })
    expect(Object.keys(api)).toEqual(['getAppInfo', 'history', 'settings', 'search', 'image', 'marketplace'])
    expect(Object.keys(api.history)).toEqual(['list', 'get', 'delete', 'clear'])
    expect(Object.keys(api.settings)).toEqual(['get', 'update'])
    expect(Object.isFrozen(api.history)).toBe(true)
    await expect(api.history.list(0)).rejects.toThrow()
    await expect(api.history.get(' ')).rejects.toThrow()
    await expect(api.history.delete('')).rejects.toThrow()
    await expect(api.settings.update({ saveHistory: 'true' } as never)).rejects.toThrow()
    expect(calls).toBe(0)
  })

  it('uses fixed channels and returns validated history and settings', async () => {
    const requests: unknown[][] = []
    const api = createLaborApi(async (channel, request) => {
      requests.push([channel, request])
      if (channel === 'history:list') return [session()]
      if (channel === 'history:get') return session()
      if (channel === 'settings:get' || channel === 'settings:update') return settings
      return null
    })
    await expect(api.history.list(5)).resolves.toEqual([session()])
    await expect(api.history.get('session-1')).resolves.toEqual(session())
    await expect(api.history.delete('session-1')).resolves.toBeNull()
    await expect(api.history.clear()).resolves.toBeNull()
    await expect(api.settings.get()).resolves.toEqual(settings)
    await expect(api.settings.update({ theme: 'dark' })).resolves.toEqual(settings)
    expect(requests).toEqual([
      ['history:list', { limit: 5 }], ['history:get', { id: 'session-1' }],
      ['history:delete', { id: 'session-1' }], ['history:clear', {}],
      ['settings:get', {}], ['settings:update', { theme: 'dark' }]
    ])
  })

  it('rejects unchecked responses for every added capability', async () => {
    const api = createLaborApi(async () => ({ rawImage: 'bytes' }))
    for (const operation of [() => api.history.list(), () => api.history.get('a'),
      () => api.history.delete('a'), () => api.history.clear(), () => api.settings.get(),
      () => api.settings.update({})]) await expect(operation()).rejects.toThrow()
  })

  it('validates requests and responses in the main-process handlers', () => {
    let calls = 0
    const handlers = createStorageHandlers({
      listSessions: () => { calls++; return [session()] }, getSession: () => session(),
      deleteSession: () => {}, clearAll: () => {},
      getSettings: () => settings, updateSettings: () => settings
    })
    expect(() => handlers['history:list']({ limit: 1, arbitrary: true })).toThrow()
    expect(() => handlers['history:delete']({ id: '' })).toThrow()
    expect(() => handlers['history:clear']({ path: 'arbitrary' })).toThrow()
    expect(() => handlers['settings:update']({ rawImage: 'bytes' })).toThrow()
    expect(calls).toBe(0)
    expect(handlers['history:list']({ limit: 1 })).toEqual([session()])
    const invalid = createStorageHandlers({ listSessions: () => [{ ...session(), imageBytes: 'private' }],
      getSession: () => null, deleteSession: () => {}, clearAll: () => {}, getSettings: () => settings, updateSettings: () => settings })
    expect(() => invalid['history:list']({ limit: 1 })).toThrow()
  })
})
