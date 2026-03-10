import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const d = db()
    const existing = d.prepare('SELECT * FROM nodi_organigramma WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false }, { status: 404 })
    d.prepare('UPDATE nodi_organigramma SET deleted_at = NULL WHERE id = ?').run(id)
    writeChangeLog('nodo_org', id, existing.nome_uo as string ?? null, 'RESTORE', null, null, null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
