import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ codice: string }> }) {
  try {
    const { codice } = await params
    const d = db()
    const existing = d.prepare('SELECT nome FROM strutture_tns WHERE codice = ? AND deleted_at IS NOT NULL').get(codice) as { nome: string | null } | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Non trovato o non cancellato' }, { status: 404 })
    d.prepare('UPDATE strutture_tns SET deleted_at = NULL WHERE codice = ?').run(codice)
    writeChangeLog('struttura_tns', codice, existing.nome ?? codice, 'RESTORE', null, null, null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
