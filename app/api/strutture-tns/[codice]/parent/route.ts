import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function POST(req: NextRequest, { params }: { params: Promise<{ codice: string }> }) {
  try {
    const { codice } = await params
    const body = await req.json() as { padre: string | null }
    const d = db()
    const existing = d.prepare('SELECT nome, padre FROM strutture_tns WHERE codice = ?').get(codice) as { nome: string | null; padre: string | null } | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Non trovato' }, { status: 404 })
    const newPadre = body.padre ?? null
    if (existing.padre === newPadre) return NextResponse.json({ success: true })
    d.prepare('UPDATE strutture_tns SET padre = ?, updated_at = CURRENT_TIMESTAMP WHERE codice = ?').run(newPadre, codice)
    writeChangeLog('struttura_tns', codice, existing.nome ?? codice, 'UPDATE', 'padre', existing.padre ?? null, newPadre)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
