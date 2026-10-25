import { randomUUID } from 'node:crypto'
import { z } from 'zod'

const requestSchema = z.object({ sessionId: z.uuid(), recordId: z.string().min(1).max(128) }).strict()
const previewSchema = z.object({ previewId: z.uuid(), title: z.string().min(1), url: z.url({ protocol: /^https?$/ }), hostname: z.string().min(1), expiresAt: z.string().datetime() }).strict()
const openRequestSchema = z.object({ previewId: z.uuid() }).strict()
const responseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.undefined() }).strict(),
  z.object({ ok: z.literal(false), error: z.enum(['preview-not-found', 'preview-expired', 'browser-open-failed']) }).strict()
])
const ttlMs = 5 * 60 * 1000

export function createSourcePreviewHandlers(dependencies: {
  lookupRecord(sessionId: string, recordId: string): { title: string; url: string } | null
  openExternal(url: string): Promise<void>
  now?: () => number
  createId?: () => string
}) {
  const now = dependencies.now ?? Date.now
  const createId = dependencies.createId ?? randomUUID
  const pending = new Map<string, { url: string; expiresAt: number }>()
  return {
    preview(payload: unknown) {
      const { sessionId, recordId } = requestSchema.parse(payload)
      const record = dependencies.lookupRecord(sessionId, recordId)
      if (!record) throw new Error('Source record not found')
      const target = new URL(record.url)
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) throw new Error('Source URL is invalid')
      const currentTime = now()
      for (const [id, item] of pending) if (currentTime >= item.expiresAt) pending.delete(id)
      const previewId = createId()
      const expiresAt = currentTime + ttlMs
      pending.set(previewId, { url: target.href, expiresAt })
      return previewSchema.parse({ previewId, title: record.title, url: target.href, hostname: target.hostname, expiresAt: new Date(expiresAt).toISOString() })
    },
    async openConfirmed(payload: unknown) {
      const { previewId } = openRequestSchema.parse(payload)
      const item = pending.get(previewId)
      pending.delete(previewId)
      if (!item) return responseSchema.parse({ ok: false, error: 'preview-not-found' })
      if (now() >= item.expiresAt) return responseSchema.parse({ ok: false, error: 'preview-expired' })
      try { await dependencies.openExternal(item.url); return responseSchema.parse({ ok: true, value: undefined }) }
      catch { return responseSchema.parse({ ok: false, error: 'browser-open-failed' }) }
    }
  }
}
