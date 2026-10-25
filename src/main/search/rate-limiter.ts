export interface RateLimitClock {
  now(): number
  delay(milliseconds: number, signal: AbortSignal): Promise<boolean>
}

const systemClock: RateLimitClock = {
  now: Date.now,
  delay: (milliseconds, signal) => new Promise(resolve => {
    if (signal.aborted) { resolve(false); return }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(true) }, milliseconds)
    const abort = () => { clearTimeout(timer); resolve(false) }
    signal.addEventListener('abort', abort, { once: true })
  })
}

export class SharedRateLimiter {
  private readonly requests: number[] = []
  constructor(private readonly requestsPerMinute: number, private readonly clock: RateLimitClock = systemClock) {
    if (!Number.isSafeInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 60) throw new RangeError('requestsPerMinute must be between 1 and 60')
  }

  async acquire(signal: AbortSignal): Promise<boolean> {
    while (!signal.aborted) {
      const now = this.clock.now()
      while (this.requests.length && this.requests[0] <= now - 60_000) this.requests.shift()
      if (this.requests.length < this.requestsPerMinute) {
        this.requests.push(now)
        return true
      }
      if (!await this.clock.delay(Math.max(1, this.requests[0] + 60_000 - now), signal)) return false
    }
    return false
  }
}
