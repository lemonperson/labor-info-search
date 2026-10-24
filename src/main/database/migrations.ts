import type { DatabaseHandle } from './database'

export function migrateDatabase(db: DatabaseHandle): void {
  const version = db.pragma('user_version', { simple: true }) as number
  if (version > 1) throw new Error('Database was created by a newer app version')
  if (version === 1) return
  db.transaction(() => {
    db.exec(`
      CREATE TABLE search_sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data))
      );
      CREATE INDEX search_sessions_started_at ON search_sessions(started_at DESC);
      CREATE TABLE subjects (
        session_id TEXT NOT NULL REFERENCES search_sessions(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        PRIMARY KEY(session_id, id)
      );
      CREATE TABLE source_records (
        session_id TEXT NOT NULL,
        id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        PRIMARY KEY(session_id, id),
        FOREIGN KEY(session_id, subject_id) REFERENCES subjects(session_id, id) ON DELETE CASCADE
      );
      CREATE TABLE event_groups (
        session_id TEXT NOT NULL,
        id TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        PRIMARY KEY(session_id, id),
        FOREIGN KEY(session_id, subject_id) REFERENCES subjects(session_id, id) ON DELETE CASCADE
      );
      CREATE TABLE event_group_members (
        session_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        record_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY(session_id, group_id, record_id),
        FOREIGN KEY(session_id, group_id) REFERENCES event_groups(session_id, id) ON DELETE CASCADE,
        FOREIGN KEY(session_id, record_id) REFERENCES source_records(session_id, id) ON DELETE CASCADE
      );
      CREATE TABLE connector_runs (
        session_id TEXT NOT NULL REFERENCES search_sessions(id) ON DELETE CASCADE,
        connector_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        data TEXT NOT NULL CHECK (json_valid(data)),
        PRIMARY KEY(session_id, connector_id)
      );
      CREATE TABLE settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL CHECK (json_valid(data))
      );
      PRAGMA user_version = 1;
    `)
  })()
}
