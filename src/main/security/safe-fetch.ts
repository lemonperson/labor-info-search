import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'

/** Callers may tighten these limits, but cannot raise the security ceilings. */
export interface SafeFetchOptions {
  timeoutMs?: number
  maxResponseBytes?: number
  maxRedirects?: number
}
export type SafeFetchErrorCode =
  | 'unsafe-url' | 'invalid-options' | 'dns-error' | 'network-error' | 'timeout'
  | 'too-many-redirects' | 'response-too-large' | 'unsupported-content-type'
  | 'unsupported-encoding' | 'http-error' | 'invalid-redirect'
export type SafeFetchResult =
  | { ok: true; url: string; status: number; contentType: string; text: string }
  | { ok: false; error: { code: SafeFetchErrorCode } }

const limits = { timeoutMs: 10_000, maxResponseBytes: 2 * 1024 * 1024, maxRedirects: 5 }
const redirectStatuses = new Set([301, 302, 303, 307, 308])
const textTypes = new Set(['text/html', 'text/plain', 'application/xhtml+xml', 'application/json'])
class FetchFailure extends Error {
  constructor(readonly code: SafeFetchErrorCode) { super(code) }
}
function fail(code: SafeFetchErrorCode): never { throw new FetchFailure(code) }

// Conservative public-unicast policy. Special-purpose ranges are denied even
// when an individual address has a globally reachable exception in IANA.
function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && ((b === 168) || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113))
  }
  if (isIP(address) !== 6 || address.includes('%')) return false
  // Only 2000::/3 global unicast; this also excludes mapped/compatible IPv4,
  // NAT64, unspecified, loopback, ULA, link/site-local and multicast addresses.
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1)
  const [first, second = '0'] = normalized.split(':')
  const a = parseInt(first, 16)
  const b = parseInt(second || '0', 16)
  return a >= 0x2000 && a <= 0x3fff &&
    !(a === 0x2001 && (b <= 0x1ff || b === 0xdb8)) &&
    a !== 0x2002 && !(a === 0x3fff && b <= 0xfff)
}

async function resolveTarget(url: URL, signal: AbortSignal): Promise<{ address: string; family: number }> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('unsafe-url')
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') || (!hostname.includes('.') && !isIP(hostname))) fail('unsafe-url')
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) fail('unsafe-url')
    return { address: hostname, family: isIP(hostname) }
  }
  let addresses
  try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }) }
  catch { fail('dns-error') }
  signal.throwIfAborted()
  if (!addresses.length || addresses.some(({ address, family }) =>
    !isPublicAddress(address) || isIP(address) !== family)) fail('unsafe-url')
  return addresses[0]
}

type HopResult = Exclude<SafeFetchResult, { ok: false }> | { redirect: string }
function requestHop(url: URL, target: { address: string; family: number }, maxBytes: number, signal: AbortSignal): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    // Keep the original hostname for Host and TLS certificate/SNI verification,
    // but never ask DNS again while connecting. No pooled/proxy/global agent.
    const lookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [target])
      else callback(null, target.address, target.family)
    }
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(url, {
      method: 'GET', agent: false, lookup, family: target.family,
      signal, maxHeaderSize: 16 * 1024,
      headers: { Accept: 'text/html, text/plain, application/xhtml+xml, application/json', 'Accept-Encoding': 'identity' }
    }, (response) => {
      response.on('error', reject)
      const stop = (code: SafeFetchErrorCode) => { reject(new FetchFailure(code)); response.destroy() }
      const status = response.statusCode ?? 0
      if (redirectStatuses.has(status)) {
        const location = response.headers.location
        if (!location) { stop('invalid-redirect'); return }
        resolve({ redirect: location })
        response.destroy()
        return
      }
      if (status < 200 || status >= 300) { stop('http-error'); return }
      const contentType = (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
      if (!textTypes.has(contentType)) { stop('unsupported-content-type'); return }
      const encoding = response.headers['content-encoding']?.trim().toLowerCase()
      if (encoding && encoding !== 'identity') { stop('unsupported-encoding'); return }
      const length = response.headers['content-length']
      if (length !== undefined && Number(length) > maxBytes) { stop('response-too-large'); return }
      const chunks: Buffer[] = []
      let size = 0
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) { stop('response-too-large'); return }
        chunks.push(chunk)
      })
      response.once('aborted', () => reject(new FetchFailure('network-error')))
      response.once('end', () => resolve({
        ok: true, url: url.href, status, contentType, text: Buffer.concat(chunks, size).toString('utf8')
      }))
    })
    request.once('error', reject)
    request.once('upgrade', (_response, socket) => { socket.destroy(); reject(new FetchFailure('http-error')) })
    request.end()
  })
}

/** Fetch bounded UTF-8 text in the main process. Returned HTML is untrusted. */
export async function safeFetchText(url: URL, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const config = { ...limits, ...options }
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (!Number.isSafeInteger(config[key]) || config[key] > limits[key] ||
      config[key] < (key === 'maxRedirects' ? 0 : 1)) return { ok: false, error: { code: 'invalid-options' } }
  }
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new FetchFailure('timeout')) }, config.timeoutMs)
  })
  const run = async (): Promise<SafeFetchResult> => {
    let current = new URL(url.href)
    current.hash = ''
    for (let hop = 0; ; hop++) {
      controller.signal.throwIfAborted()
      const target = await resolveTarget(current, controller.signal)
      controller.signal.throwIfAborted()
      const result = await requestHop(current, target, config.maxResponseBytes, controller.signal)
      if (!('redirect' in result)) return result
      if (hop >= config.maxRedirects) fail('too-many-redirects')
      try { current = new URL(result.redirect, current); current.hash = '' }
      catch { fail('invalid-redirect') }
    }
  }
  try { return await Promise.race([run(), timeout]) }
  catch (error) {
    return { ok: false, error: { code: controller.signal.aborted ? 'timeout' : error instanceof FetchFailure ? error.code : 'network-error' } }
  } finally { clearTimeout(timer) }
}
