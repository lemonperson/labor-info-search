import { describe, expect, it, vi } from 'vitest'
import { openDatabaseOrRecover } from '../../../src/main/database/startup'

describe('database startup recovery', () => {
  it('preserves the failed database and enters recovery without retrying or replacing it', () => {
    const originalFile = { bytes: 'existing database' }
    const open = vi.fn(() => { throw new Error('migration failed') })
    const recover = vi.fn()
    expect(openDatabaseOrRecover(open, recover)).toBeNull()
    expect(recover).toHaveBeenCalledExactlyOnceWith(expect.any(Error))
    expect(open).toHaveBeenCalledExactlyOnceWith()
    expect(originalFile.bytes).toBe('existing database')
  })
})
