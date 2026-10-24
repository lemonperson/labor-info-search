import dns from 'node:dns/promises'
import type { LookupAddress, LookupAllOptions } from 'node:dns'
import http from 'node:http'
import net from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { safeFetchText } from '../../../src/main/security/safe-fetch'

let server: http.Server
let base: string
let requests: string[]
let dialed: string[]
let handler: http.RequestListener
let resolver: MockInstance<(hostname: string, options: LookupAllOptions) => Promise<LookupAddress[]>>

beforeEach(async () => {
  requests = []
  dialed = []
  handler = (_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<p>劳动信息😀</p>') }
  server = http.createServer((request, response) => { requests.push(request.url ?? ''); handler(request, response) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as net.AddressInfo).port
  base = `http://public.example:${port}`
  resolver = vi.spyOn(dns, 'lookup') as unknown as typeof resolver
  resolver.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  // Only replace the OS dial boundary. DNS validation, pinned lookup, HTTP parsing,
  // redirects, streaming and socket teardown remain production behavior.
  vi.spyOn(http.Agent.prototype, 'createConnection').mockImplementation((options) => {
    const socket = new net.Socket()
    const lookup = options.lookup as net.LookupFunction
    if (!lookup) throw new Error('Unpinned connection')
    lookup('public.example', { all: true }, (error, addresses) => {
      if (error) { socket.destroy(error); return }
      const address = typeof addresses === 'string' ? addresses : addresses[0].address
      dialed.push(address)
      if (address !== '93.184.216.34' && address !== '2606:4700:4700::1111') throw new Error(`Unsafe dial: ${address}`)
      socket.connect(port, '127.0.0.1')
    })
    return socket
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const failure = (code: string) => ({ ok: false, error: { code } })

describe('safe HTTP text boundary', () => {
  it.each(['file:///etc/passwd', 'ftp://public.example/', 'http://user:pass@public.example/'])('blocks unsafe URL %s before dialing', async (url) => {
    expect(await safeFetchText(new URL(url), {})).toMatchObject(failure('unsafe-url'))
    expect(dialed).toEqual([])
  })
  it.each(['localhost', 'LOCALHOST.', 'foo.localhost', 'printer.local', 'intranet', '127.0.0.1', '127.1', '2130706433', '0x7f000001', '0.0.0.0', '10.0.0.1', '172.16.1.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255', '[::]', '[::1]', '[::ffff:127.0.0.1]', '[fc00::1]', '[fe80::1]', '[ff02::1]', '[64:ff9b::7f00:1]', '[2002:7f00:1::]', '[2001::1]', '[2001:db8::1]', '[3fff::1]'])('blocks non-public target %s', async (host) => {
    expect(await safeFetchText(new URL(`http://${host}/`), {})).toMatchObject(failure('unsafe-url'))
    expect(dialed).toEqual([])
  })
  it.each(['10.0.0.1', '::1', '::ffff:10.0.0.1', 'invalid-address'])('rejects DNS answer %s', async (address) => {
    resolver.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }])
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('unsafe-url'))
    expect(requests).toEqual([])
  })
  it('rejects mixed public/private DNS results', async () => {
    resolver.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '192.168.1.1', family: 4 }])
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('unsafe-url'))
    expect(requests).toEqual([])
  })
  it('fetches public UTF-8 HTML through a pinned connection despite changed DNS', async () => {
    resolver.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    expect(await safeFetchText(new URL(base), {})).toEqual({ ok: true, url: `${base}/`, status: 200, contentType: 'text/html', text: '<p>劳动信息😀</p>' })
    expect(dialed).toEqual(['93.184.216.34'])
  })
  it('allows public IPv6 DNS results', async () => {
    resolver.mockResolvedValue([{ address: '2606:4700:4700::1111', family: 6 }])
    expect(await safeFetchText(new URL(base), {})).toMatchObject({ ok: true })
    expect(dialed).toEqual(['2606:4700:4700::1111'])
  })
  it.each(['http://127.0.0.1/secret', 'http://user:pass@public.example/', 'file:///secret'])('rejects redirect to %s', async (location) => {
    handler = (_request, response) => { response.writeHead(302, { Location: location }); response.end() }
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('unsafe-url'))
    expect(requests).toHaveLength(1)
  })
  it('rechecks DNS even on same-host relative redirects', async () => {
    resolver.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]).mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    handler = (_request, response) => { response.writeHead(302, { Location: '/next' }); response.end() }
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('unsafe-url'))
    expect(requests).toEqual(['/'])
  })
  it('allows five redirects but rejects the sixth', async () => {
    handler = (request, response) => {
      const hop = Number(request.url?.slice(1) || 0)
      if (hop < 5) { response.writeHead(302, { Location: `/${hop + 1}` }); response.end() }
      else { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('完成') }
    }
    expect(await safeFetchText(new URL(base), {})).toMatchObject({ ok: true, text: '完成' })
    handler = (_request, response) => { response.writeHead(302, { Location: '/loop' }); response.end() }
    requests = []
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('too-many-redirects'))
    expect(requests).toHaveLength(6)
  })
  it('rejects default oversized response before buffering its body', async () => {
    handler = (_request, response) => { response.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': 2097153 }); response.flushHeaders() }
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('response-too-large'))
  })
  it('counts streamed bytes across chunks without Content-Length', async () => {
    handler = (_request, response) => { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.write('中'); response.end('文') }
    expect(await safeFetchText(new URL(base), { maxResponseBytes: 5 })).toMatchObject(failure('response-too-large'))
    expect(await safeFetchText(new URL(base), { maxResponseBytes: 6 })).toMatchObject({ ok: true, text: '中文' })
  })
  it.each(['image/png', 'application/octet-stream', 'text/event-stream', ''])('rejects unsupported MIME %s', async (contentType) => {
    handler = (_request, response) => { response.writeHead(200, contentType ? { 'Content-Type': contentType } : {}); response.end('body') }
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('unsupported-content-type'))
  })
  it('rejects compressed data instead of exposing an unbounded decompressor', async () => {
    handler = (_request, response) => { response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' }); response.end('compressed') }
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('unsupported-encoding'))
  })
  it.each(['headers', 'body', 'dns'])('times out while waiting for %s', async (stage) => {
    if (stage === 'dns') resolver.mockImplementation(() => new Promise(() => {}))
    handler = (_request, response) => { if (stage === 'body') { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.write('part') } }
    expect(await safeFetchText(new URL(base), { timeoutMs: 40 })).toMatchObject(failure('timeout'))
  })
  it('returns typed DNS and HTTP failures', async () => {
    resolver.mockRejectedValueOnce(new Error('private system detail'))
    expect(await safeFetchText(new URL(base), {})).toEqual(failure('dns-error'))
    handler = (_request, response) => { response.writeHead(503); response.end() }
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('http-error'))
  })
  it('returns typed failure for interrupted streams', async () => {
    handler = (_request, response) => { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.write('part'); setImmediate(() => response.destroy()) }
    expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('network-error'))
  })
  it('rejects options that weaken hard limits or are malformed', async () => {
    for (const options of [{ timeoutMs: 10001 }, { maxResponseBytes: 2097153 }, { maxRedirects: 6 }, { timeoutMs: NaN }, { maxResponseBytes: -1 }, { maxRedirects: 0.5 }]) {
      expect(await safeFetchText(new URL(base), options)).toMatchObject(failure('invalid-options'))
    }
    expect(requests).toEqual([])
  })
})


it('never dials after a timed-out DNS operation eventually resolves', async () => {
  let finishDns!: (addresses: LookupAddress[]) => void
  resolver.mockImplementation(() => new Promise((resolve) => { finishDns = resolve }))
  expect(await safeFetchText(new URL(base), { timeoutMs: 30 })).toMatchObject(failure('timeout'))
  finishDns([{ address: '93.184.216.34', family: 4 }])
  await new Promise<void>((resolve) => setImmediate(resolve))
  expect(dialed).toEqual([])
  expect(requests).toEqual([])
})

it('uses one overall timeout across redirect hops', async () => {
  handler = (_request, response) => {
    const timer = setTimeout(() => { response.writeHead(302, { Location: '/next' }); response.end() }, 80)
    response.once('close', () => clearTimeout(timer))
  }
  expect(await safeFetchText(new URL(base), { timeoutMs: 120 })).toMatchObject(failure('timeout'))
  expect(requests.length).toBeLessThanOrEqual(2)
})

it.each([undefined, 'http://[bad'])('rejects missing or malformed redirect Location %s', async (location) => {
  handler = (_request, response) => { response.writeHead(302, location ? { Location: location } : {}); response.end() }
  expect(await safeFetchText(new URL(base), {})).toMatchObject(failure('invalid-redirect'))
  expect(requests).toHaveLength(1)
})

it('allows callers to disable redirects', async () => {
  handler = (_request, response) => { response.writeHead(302, { Location: '/next' }); response.end() }
  expect(await safeFetchText(new URL(base), { maxRedirects: 0 })).toMatchObject(failure('too-many-redirects'))
  expect(requests).toHaveLength(1)
})
