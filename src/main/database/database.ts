import Database from 'better-sqlite3'
import { migrateDatabase } from './migrations'

export type DatabaseHandle = Database.Database

export function openDatabase(path: string): DatabaseHandle {
  const db = new Database(path)
  try {
    db.pragma('foreign_keys = ON')
    db.pragma('secure_delete = ON')
    db.pragma('journal_mode = DELETE')
    migrateDatabase(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
