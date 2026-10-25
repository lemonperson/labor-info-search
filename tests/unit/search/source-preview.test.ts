import { describe, expect, it, vi } from 'vitest'
import { createSourcePreviewHandlers } from '../../../src/main/search/source-preview'

describe('one-time source preview', () => {
  it('binds confirmation to the validated stored record URL and opens it once', async () => {
    const openExternal = vi.fn(async () => {})
    const handlers = createSourcePreviewHandlers({
      lookupRecord: (sessionId, recordId) => sessionId === '00000000-0000-4000-8000-000000000001' && recordId === 'e2e-fixture-result'
        ? { title: '原文标题', url: 'https://news.example.com/a?x=1' } : null,
      openExternal, now: () => 1000, createId: () => '00000000-0000-4000-8000-000000000003'
    })
    const preview = await handlers.preview({ sessionId: '00000000-0000-4000-8000-000000000001', recordId: 'e2e-fixture-result' })
    expect(preview).toMatchObject({ hostname: 'news.example.com', url: 'https://news.example.com/a?x=1', title: '原文标题' })
    await expect(handlers.openConfirmed({ previewId: preview.previewId })).resolves.toMatchObject({ ok: true })
    await expect(handlers.openConfirmed({ previewId: preview.previewId })).resolves.toMatchObject({ ok: false })
    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://news.example.com/a?x=1')
  })

  it('never previews a URL supplied directly by the renderer', async () => {
    const handlers = createSourcePreviewHandlers({ lookupRecord: () => null, openExternal: async () => {} })
    expect(() => handlers.preview({ url: 'https://evil.example/' })).toThrow()
  })
})
