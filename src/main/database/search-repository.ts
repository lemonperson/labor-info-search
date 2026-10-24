import { historyIdRequestSchema, historyListRequestSchema, searchSessionSchema } from '../../shared/schemas'
import type { SearchSession } from '../../shared/types'
import type { DatabaseHandle } from './database'
import { SettingsRepository } from './settings-repository'

type DataRow = { data: string }

export class SearchRepository {
  constructor(private readonly db: DatabaseHandle) {}

  saveSession(input: SearchSession): void {
    const session = searchSessionSchema.parse(input)
    if (!new SettingsRepository(this.db).getSettings().saveHistory) return
    if ([...session.queries, ...session.records, ...session.eventGroups].some(item => item.subjectId !== session.subject.id)) {
      throw new Error('Session data belongs to another subject')
    }
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM search_sessions WHERE id = ?').run(session.id)
      const { subject, records, eventGroups, connectorRuns, ...metadata } = session
      this.db.prepare('INSERT INTO search_sessions(id, started_at, data) VALUES(?, ?, ?)')
        .run(session.id, session.startedAt, JSON.stringify(metadata))
      this.db.prepare('INSERT INTO subjects(session_id, id, data) VALUES(?, ?, ?)')
        .run(session.id, subject.id, JSON.stringify(subject))
      const insertRecord = this.db.prepare('INSERT INTO source_records(session_id, id, subject_id, position, data) VALUES(?, ?, ?, ?, ?)')
      records.forEach((record, position) => insertRecord.run(session.id, record.id, record.subjectId, position, JSON.stringify(record)))
      const insertGroup = this.db.prepare('INSERT INTO event_groups(session_id, id, subject_id, position, data) VALUES(?, ?, ?, ?, ?)')
      const insertMember = this.db.prepare('INSERT INTO event_group_members(session_id, group_id, record_id, position) VALUES(?, ?, ?, ?)')
      eventGroups.forEach(({ recordIds, ...group }, position) => {
        insertGroup.run(session.id, group.id, group.subjectId, position, JSON.stringify(group))
        recordIds.forEach((recordId, index) => insertMember.run(session.id, group.id, recordId, index))
      })
      const insertRun = this.db.prepare('INSERT INTO connector_runs(session_id, connector_id, position, data) VALUES(?, ?, ?, ?)')
      connectorRuns.forEach((run, position) => insertRun.run(session.id, run.connectorId, position, JSON.stringify(run)))
    })()
  }

  getSession(id: string): SearchSession | null {
    historyIdRequestSchema.parse({ id })
    const row = this.db.prepare('SELECT data FROM search_sessions WHERE id = ?').get(id) as DataRow | undefined
    if (!row) return null
    const subject = this.db.prepare('SELECT data FROM subjects WHERE session_id = ?').get(id) as DataRow
    const records = this.db.prepare('SELECT data FROM source_records WHERE session_id = ? ORDER BY position').all(id) as DataRow[]
    const groups = this.db.prepare('SELECT id, data FROM event_groups WHERE session_id = ? ORDER BY position').all(id) as (DataRow & { id: string })[]
    const runs = this.db.prepare('SELECT data FROM connector_runs WHERE session_id = ? ORDER BY position').all(id) as DataRow[]
    const session = searchSessionSchema.parse({
      ...JSON.parse(row.data), subject: JSON.parse(subject.data),
      records: records.map(value => JSON.parse(value.data)),
      eventGroups: groups.map(group => ({ ...JSON.parse(group.data),
        recordIds: (this.db.prepare('SELECT record_id FROM event_group_members WHERE session_id = ? AND group_id = ? ORDER BY position')
          .all(id, group.id) as { record_id: string }[]).map(member => member.record_id) })),
      connectorRuns: runs.map(value => JSON.parse(value.data))
    })
    if ([...session.queries, ...session.records, ...session.eventGroups].some(item => item.subjectId !== session.subject.id)) {
      throw new Error('Stored session data belongs to another subject')
    }
    return session
  }

  listSessions(limit: number): SearchSession[] {
    historyListRequestSchema.parse({ limit })
    // julianday orders timestamps correctly even when sources use different UTC offsets.
    const rows = this.db.prepare('SELECT id FROM search_sessions ORDER BY julianday(started_at) DESC, id DESC LIMIT ?')
      .all(limit) as { id: string }[]
    return rows.map(row => this.getSession(row.id)!)
  }

  deleteSession(id: string): void {
    historyIdRequestSchema.parse({ id })
    this.db.prepare('DELETE FROM search_sessions WHERE id = ?').run(id)
  }

  clearAll(): void {
    this.db.prepare('DELETE FROM search_sessions').run()
    // Reclaim free pages left by cached history; preferences remain in the database.
    this.db.exec('VACUUM')
  }
}
