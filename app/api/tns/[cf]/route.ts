import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

const UPDATABLE = [
  'codice_tns','padre_tns','livello_tns','titolare_tns','tipo_approvatore','codice_approvatore',
  'viaggiatore','approvatore','cassiere','segretario','controllore','amministrazione',
  'visualizzatore','escluso_tns','sede_tns','cdc_tns',
  'ruoli_oltrv','ruoli_tns_desc','segr_redaz','segreteria_red_asst','segretario_asst',
  'controllore_asst','ruoli_afc','ruoli_hr','altri_ruoli','gruppo_sind',
]

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

    const label = [existing.cognome, existing.nome].filter(Boolean).join(' ') || cf

    for (const [field, newVal] of Object.entries(body)) {
      if (!UPDATABLE.includes(field)) continue
      const oldVal = existing[field]
      if (String(oldVal ?? '') === String(newVal ?? '')) continue
      d.prepare(`UPDATE persone SET ${field} = ? WHERE cf = ?`).run(newVal ?? null, cf)
      writeChangeLog('persona', cf, label as string, 'UPDATE', field, String(oldVal ?? ''), String(newVal ?? ''))
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

// DELETE TNS: azzera tutti i campi TNS della persona (non cancella la persona)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const d = db()

    const existing = d.prepare('SELECT * FROM persone WHERE cf = ?').get(cf) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    d.prepare(`UPDATE persone SET ${UPDATABLE.map(f => `${f} = NULL`).join(', ')} WHERE cf = ?`).run(cf)
    const label = [existing.cognome, existing.nome].filter(Boolean).join(' ') || cf
    writeChangeLog('persona', cf, label as string, 'UPDATE', 'codice_tns', String(existing.codice_tns ?? ''), null)

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
