import { initDb, getDb } from './db/init'
import type Database from 'better-sqlite3'

let initialized = false

export function db(): Database.Database {
  if (!initialized) {
    initDb()
    initialized = true
  }
  return getDb()
}

export function writeChangeLog(
  entityType: string,
  entityId: string,
  entityLabel: string | null,
  action: string,
  fieldName: string | null,
  oldValue: string | null,
  newValue: string | null
): void {
  db().prepare(`
    INSERT INTO change_log (entity_type, entity_id, entity_label, action, field_name, old_value, new_value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(entityType, entityId, entityLabel, action, fieldName, oldValue, newValue)
}
