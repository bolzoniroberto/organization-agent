import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import path from 'path'
import fs from 'fs'

export async function POST() {
  try {
    const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'hrplatform.db')
    const backupDir = path.join(path.dirname(dbPath), 'backups')
    fs.mkdirSync(backupDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = path.join(backupDir, `hrplatform_${timestamp}.db`)

    // better-sqlite3 ha un metodo .backup() nativo — sicuro anche con WAL attivo
    await db().backup(backupPath)

    const stats = fs.statSync(backupPath)
    const sizeKb = Math.round(stats.size / 1024)

    // Mantieni gli ultimi 14 backup
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('hrplatform_') && f.endsWith('.db'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(backupDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)

    files.slice(14).forEach(f => {
      try { fs.unlinkSync(path.join(backupDir, f.name)) } catch { /* ignore */ }
    })

    return NextResponse.json({
      success: true,
      file: path.basename(backupPath),
      sizeKb,
      totalBackups: Math.min(files.length, 14),
    })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { filename } = await req.json()
    if (!filename || !/^hrplatform_[\w\-.]+\.db$/.test(filename)) {
      return NextResponse.json({ success: false, error: 'filename non valido' }, { status: 400 })
    }
    const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'hrplatform.db')
    const backupDir = path.join(path.dirname(dbPath), 'backups')
    const filePath = path.join(backupDir, filename)
    if (!fs.existsSync(filePath)) return NextResponse.json({ success: false, error: 'File non trovato' }, { status: 404 })
    fs.unlinkSync(filePath)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'hrplatform.db')
    const backupDir = path.join(path.dirname(dbPath), 'backups')

    if (!fs.existsSync(backupDir)) return NextResponse.json({ backups: [] })

    const backups = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('hrplatform_') && f.endsWith('.db'))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f))
        return { name: f, sizeKb: Math.round(stats.size / 1024), createdAt: stats.mtime.toISOString() }
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    return NextResponse.json({ backups })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
