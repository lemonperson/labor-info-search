import { describe, expect, it, vi } from 'vitest'
import { createMarketplaceHandlers } from '../../../src/main/ipc/register-ipc'
import type { ProductResolution } from '../../../src/shared/types'

const product: ProductResolution = { platform: 'unknown', productTitle: '', finalUrl: '', candidates: [], evidence: [], warnings: [], status: 'unsupported' }

describe('marketplace IPC handlers', () => {
  it('validates requests and returns the validated resolver result', async () => {
    const resolve = vi.fn(async () => product)
    const handlers = createMarketplaceHandlers({ resolve })
    await expect(handlers['marketplace:resolve']({ rawUrl: 'https://example.com/product' })).resolves.toEqual(product)
    expect(resolve).toHaveBeenCalledWith('https://example.com/product', expect.any(AbortSignal))
    await expect(handlers['marketplace:resolve']({ rawUrl: 2 })).rejects.toThrow()
  })

  it('cancels an in-flight resolver when cancellation is requested', async () => {
    let signal: AbortSignal | undefined
    const resolve = vi.fn((_url: string, active: AbortSignal) => {
      signal = active
      return new Promise<typeof product>(resolveResult => active.addEventListener('abort', () => resolveResult(product), { once: true }))
    })
    const handlers = createMarketplaceHandlers({ resolve })
    const pending = handlers['marketplace:resolve']({ rawUrl: 'https://example.com/product' })
    await Promise.resolve()
    await expect(handlers['marketplace:cancel']({})).resolves.toBeNull()
    await expect(pending).resolves.toEqual(product)
    expect(signal?.aborted).toBe(true)
  })
})
