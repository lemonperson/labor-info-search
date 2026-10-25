import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type DatabaseHandle } from '../../../src/main/database/database'
import { SearchRepository } from '../../../src/main/database/search-repository'
import { SettingsRepository } from '../../../src/main/database/settings-repository'
import { session } from './fixtures'

let directory: string
let db: DatabaseHandle
let repository: SearchRepository
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'labor-storage-'))
  db = openDatabase(join(directory, 'test.sqlite'))
  repository = new SearchRepository(db)
})
afterEach(() => { db?.close(); rmSync(directory, { recursive: true, force: true }) })

describe('private search storage', () => {
  it('migrates an empty version 0 file and reopens without losing data', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(1)
    repository.saveSession(session())
    db.close()
    db = openDatabase(join(directory, 'test.sqlite'))
    expect(new SearchRepository(db).getSession('session-1')).toEqual(session())
  })

  it('round trips sources, groups, query evidence, and connector runs', () => {
    repository.saveSession(session())
    expect(repository.getSession('session-1')).toEqual(session())
    expect(repository.getSession('missing')).toBeNull()
    expect(repository.listSessions(10)).toEqual([session()])
  })

  it('updates a session atomically without duplicating children', () => {
    repository.saveSession(session())
    const updated = { ...session(), records: [], eventGroups: [], status: 'completed' as const }
    repository.saveSession(updated)
    expect(repository.getSession('session-1')).toEqual(updated)
    expect(db.prepare('SELECT count(*) AS count FROM source_records').get()).toEqual({ count: 0 })
  })

  it('deletes a session and cascades all owned rows', () => {
    repository.saveSession(session())
    repository.deleteSession('session-1')
    expect(repository.getSession('session-1')).toBeNull()
    for (const table of ['subjects', 'source_records', 'event_groups', 'event_group_members', 'connector_runs']) {
      expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
    }
  })

  it('does not merge similar company names even when child IDs are reused', () => {
    repository.saveSession(session('a', '示例制造有限公司'))
    repository.saveSession({ ...session('b', '示例制造（上海）有限公司'), startedAt: '2026-10-24T08:00:00Z' })
    expect(repository.getSession('a')?.subject.name).toBe('示例制造有限公司')
    expect(repository.getSession('b')?.subject.name).toBe('示例制造（上海）有限公司')
    expect(repository.listSessions(1).map(value => value.id)).toEqual(['b'])
    repository.deleteSession('a')
    expect(repository.getSession('b')?.records).toHaveLength(1)
  })

  it('rolls back replacement if a member references a missing source', () => {
    repository.saveSession(session())
    const invalid = { ...session(), eventGroups: [{ ...session().eventGroups[0], recordIds: ['missing'] }] }
    expect(() => repository.saveSession(invalid)).toThrow()
    expect(repository.getSession('session-1')).toEqual(session())
  })

  it('refuses cross-subject records and queries', () => {
    for (const invalid of [
      { ...session(), records: [{ ...session().records[0], subjectId: 'other-subject' }] },
      { ...session(), queries: [{ ...session().queries[0], subjectId: 'other-subject' }] }
    ]) expect(() => repository.saveSession(invalid)).toThrow()
    expect(repository.listSessions(10)).toEqual([])
  })

  it('does not persist new or updated sessions when history is disabled', () => {
    repository.saveSession(session())
    new SettingsRepository(db).updateSettings({ saveHistory: false })
    repository.saveSession({ ...session(), status: 'completed' })
    repository.saveSession(session('new'))
    expect(repository.getSession('session-1')?.status).toBe('partial')
    expect(repository.getSession('new')).toBeNull()
  })

  it('clears session caches while preserving preferences', () => {
    repository.saveSession(session())
    new SettingsRepository(db).updateSettings({ theme: 'dark' })
    repository.clearAll()
    expect(repository.listSessions(10)).toEqual([])
    expect(new SettingsRepository(db).getSettings().theme).toBe('dark')
  })

  it('rejects screenshot path or bytes, long excerpts, and upgraded personal statements before writing', () => {
    for (const invalid of [
      { ...session(), imageBytes: 'base64-image' },
      { ...session(), imagePath: 'C:/Users/person/private-label.png' },
      { ...session(), records: [{ ...session().records[0], excerpt: '文'.repeat(1201) }] },
      { ...session(), records: [{ ...session().records[0], claimStatus: 'independently-confirmed' }] }
    ]) expect(() => repository.saveSession(invalid as never)).toThrow()
    expect(repository.listSessions(10)).toEqual([])
  })

  it('validates records again when reading corrupted stored data', () => {
    repository.saveSession(session())
    db.prepare('UPDATE source_records SET data = ?').run(JSON.stringify({ ...session().records[0], claimStatus: 'disputed' }))
    expect(() => repository.getSession('session-1')).toThrow()
  })

  it('validates list bounds rather than allowing unbounded reads', () => {
    for (const limit of [0, -1, 1.5, 101]) expect(() => repository.listSessions(limit)).toThrow()
  })
})
