import { initDb, getDb } from './db/init'
import type Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let initialized = false

declare global { var __autoBackupStarted: boolean | undefined }

export function db(): Database.Database {
  if (!initialized) {
    initDb()
    initialized = true
    startAutoBackup()
  }
  return getDb()
}

export function closeDb(): void {
  if (initialized) {
    try { getDb().close() } catch { /* ignore */ }
    initialized = false
  }
}

function startAutoBackup() {
  if (globalThis.__autoBackupStarted) return
  globalThis.__autoBackupStarted = true
  const INTERVAL_MS = 2 * 60 * 60 * 1000 // 2 ore
  setInterval(() => {
    try {
      const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'hrplatform.db')
      const backupDir = path.join(path.dirname(dbPath), 'backups')
      fs.mkdirSync(backupDir, { recursive: true })
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = path.join(backupDir, `hrplatform_${timestamp}.db`)
      getDb().backup(backupPath).then(() => {
        // Mantieni gli ultimi 30 backup
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('hrplatform_') && f.endsWith('.db'))
          .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)
        files.slice(30).forEach(f => { try { fs.unlinkSync(path.join(backupDir, f.name)) } catch { /* ignore */ } })
      }).catch(e => console.error('[auto-backup]', e))
    } catch (e) {
      console.error('[auto-backup]', e)
    }
  }, INTERVAL_MS)
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
