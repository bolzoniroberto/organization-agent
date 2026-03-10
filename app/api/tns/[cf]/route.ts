import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

const UPDATABLE = [
  'codice_tns','padre_tns','livello_tns','titolare_tns','tipo_approvatore','codice_approvatore',
  'viaggiatore','approvatore','cassiere','segretario','controllore','amministrazione',
  'visualizzatore','escluso_tns','sede_tns','cdc_tns',
  'ruoli_oltrv','ruoli','segr_redaz','segreteria_red_asst','segretario_asst',
  'controllore_asst','ruoli_afc','ruoli_hr','altri_ruoli','gruppo_sind',
]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const row = db().prepare('SELECT * FROM ruoli_tns WHERE cf_persona = ?').get(cf)
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

    const existing = d.prepare('SELECT * FROM ruoli_tns WHERE cf_persona = ?').get(cf) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    for (const [field, newVal] of Object.entries(body)) {
      if (!UPDATABLE.includes(field)) continue
      const oldVal = existing[field]
      if (String(oldVal ?? '') === String(newVal ?? '')) continue
      d.prepare(`UPDATE ruoli_tns SET ${field} = ? WHERE cf_persona = ?`).run(newVal ?? null, cf)
      writeChangeLog('tns', cf, cf, 'UPDATE', field, String(oldVal ?? ''), String(newVal ?? ''))
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const d = db()
    const hard = req.nextUrl.searchParams.get('hard') === 'true'

    const existing = d.prepare('SELECT * FROM ruoli_tns WHERE cf_persona = ?').get(cf) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    if (hard) {
      d.prepare('DELETE FROM ruoli_tns WHERE cf_persona = ?').run(cf)
      writeChangeLog('tns', cf, null, 'DELETE', null, null, 'hard')
    } else {
      writeChangeLog('tns', cf, null, 'DELETE', null, null, null)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
