import { NextResponse } from 'next/server'
import { closeDb } from '@/lib/db'
import path from 'path'
import fs from 'fs'

export async function POST(req: Request) {
  const { filename } = await req.json()
  if (!filename || !/^hrplatform_[\w\-.]+\.db$/.test(filename)) {
    return NextResponse.json({ success: false, error: 'filename non valido' }, { status: 400 })
  }

  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'hrplatform.db')
  const backupDir = path.join(path.dirname(dbPath), 'backups')
  const restoreFrom = path.join(backupDir, filename)

  if (!fs.existsSync(restoreFrom)) {
    return NextResponse.json({ success: false, error: 'File non trovato' }, { status: 404 })
  }

  const safetyTs = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safetyPath = path.join(backupDir, `hrplatform_prerestore_${safetyTs}.db`)

  try {
    closeDb()
    fs.copyFileSync(dbPath, safetyPath)
    fs.copyFileSync(restoreFrom, dbPath)
    for (const ext of ['-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + ext) } catch { /* ignore */ }
    }
    return NextResponse.json({ success: true, safetyBackup: path.basename(safetyPath) })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
