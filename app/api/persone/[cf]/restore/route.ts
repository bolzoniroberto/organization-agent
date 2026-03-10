import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const d = db()
    const existing = d.prepare('SELECT * FROM persone WHERE cf = ?').get(cf) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false }, { status: 404 })
    d.prepare('UPDATE persone SET deleted_at = NULL WHERE cf = ?').run(cf)
    const label = `${existing.cognome ?? ''} ${existing.nome ?? ''}`.trim() || null
    writeChangeLog('persona', cf, label, 'RESTORE', null, null, null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
