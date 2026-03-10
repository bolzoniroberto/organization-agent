import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

const UPDATABLE = ['cognome','nome','data_nascita','sesso','email','societa','area','sotto_area',
  'cdc_amministrativo','sede','data_assunzione','data_fine_rapporto','tipo_contratto','qualifica',
  'livello','modalita_presenze','part_time','ral','extra_data']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const row = db().prepare('SELECT * FROM persone WHERE cf = ?').get(cf)
    if (!row) return NextResponse.json(null, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const d = db()
    const body = await req.json() as Record<string, unknown>
    const existing = d.prepare('SELECT * FROM persone WHERE cf = ?').get(cf) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    for (const [field, newVal] of Object.entries(body)) {
      if (!UPDATABLE.includes(field)) continue
      const oldVal = existing[field]
      if (String(oldVal ?? '') === String(newVal ?? '')) continue
      d.prepare(`UPDATE persone SET ${field} = ?, ultimo_aggiornamento = CURRENT_TIMESTAMP WHERE cf = ?`).run(newVal ?? null, cf)
      const label = `${existing.cognome ?? ''} ${existing.nome ?? ''}`.trim() || null
      writeChangeLog('persona', cf, label, 'UPDATE', field, String(oldVal ?? ''), String(newVal ?? ''))
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const d = db()
    const existing = d.prepare('SELECT * FROM persone WHERE cf = ?').get(cf) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false }, { status: 404 })
    d.prepare('UPDATE persone SET deleted_at = CURRENT_TIMESTAMP WHERE cf = ?').run(cf)
    const label = `${existing.cognome ?? ''} ${existing.nome ?? ''}`.trim() || null
    writeChangeLog('persona', cf, label, 'DELETE', null, null, null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
