import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const d = db()
    const url = new URL(req.url)
    const showDeleted = url.searchParams.get('showDeleted') === 'true'
    const where = showDeleted ? '' : 'WHERE deleted_at IS NULL'
    const rows = d.prepare(`SELECT * FROM persone ${where} ORDER BY cognome, nome`).all()
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const d = db()
    const body = await req.json() as Record<string, unknown>
    if (!body.cf) return NextResponse.json({ success: false, error: 'cf obbligatorio' }, { status: 400 })

    d.prepare(`
      INSERT INTO persone (cf, cognome, nome, data_nascita, sesso, email, societa, area, sotto_area,
        cdc_amministrativo, sede, data_assunzione, data_fine_rapporto, tipo_contratto, qualifica,
        livello, modalita_presenze, part_time, ral, extra_data)
      VALUES (@cf, @cognome, @nome, @data_nascita, @sesso, @email, @societa, @area, @sotto_area,
        @cdc_amministrativo, @sede, @data_assunzione, @data_fine_rapporto, @tipo_contratto, @qualifica,
        @livello, @modalita_presenze, @part_time, @ral, @extra_data)
    `).run({
      cf: body.cf, cognome: body.cognome ?? null, nome: body.nome ?? null,
      data_nascita: body.data_nascita ?? null, sesso: body.sesso ?? null, email: body.email ?? null,
      societa: body.societa ?? null, area: body.area ?? null, sotto_area: body.sotto_area ?? null,
      cdc_amministrativo: body.cdc_amministrativo ?? null, sede: body.sede ?? null,
      data_assunzione: body.data_assunzione ?? null, data_fine_rapporto: body.data_fine_rapporto ?? null,
      tipo_contratto: body.tipo_contratto ?? null, qualifica: body.qualifica ?? null,
      livello: body.livello ?? null, modalita_presenze: body.modalita_presenze ?? null,
      part_time: body.part_time ?? 0, ral: body.ral ?? null, extra_data: body.extra_data ?? null,
    })

    writeChangeLog('persona', String(body.cf), `${body.cognome ?? ''} ${body.nome ?? ''}`.trim() || null, 'CREATE', null, null, null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
