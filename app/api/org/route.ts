import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const d = db()
    const url = new URL(req.url)
    const showDeleted = url.searchParams.get('showDeleted') === 'true'

    const where = showDeleted ? '' : 'WHERE deleted_at IS NULL'
    const rows = d.prepare(`SELECT * FROM nodi_organigramma ${where} ORDER BY id`).all()

    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const d = db()
    const body = await req.json() as Record<string, unknown>

    if (!body.id) return NextResponse.json({ success: false, error: 'id obbligatorio' }, { status: 400 })

    d.prepare(`
      INSERT INTO nodi_organigramma (
        id, reports_to, tipo_nodo, cf_persona, nome_uo, nome_uo_2, centro_costo, fte,
        job_title, funzione, processo, incarico_sgsl, societa_org, testata_gg, sede,
        tipo_collab, note_uo, extra_data
      ) VALUES (
        @id, @reports_to, @tipo_nodo, @cf_persona, @nome_uo, @nome_uo_2, @centro_costo, @fte,
        @job_title, @funzione, @processo, @incarico_sgsl, @societa_org, @testata_gg, @sede,
        @tipo_collab, @note_uo, @extra_data
      )
    `).run({
      id: body.id ?? null,
      reports_to: body.reports_to ?? null,
      tipo_nodo: body.tipo_nodo ?? 'STRUTTURA',
      cf_persona: body.cf_persona ?? null,
      nome_uo: body.nome_uo ?? null,
      nome_uo_2: body.nome_uo_2 ?? null,
      centro_costo: body.centro_costo ?? null,
      fte: body.fte ?? null,
      job_title: body.job_title ?? null,
      funzione: body.funzione ?? null,
      processo: body.processo ?? null,
      incarico_sgsl: body.incarico_sgsl ?? null,
      societa_org: body.societa_org ?? null,
      testata_gg: body.testata_gg ?? null,
      sede: body.sede ?? null,
      tipo_collab: body.tipo_collab ?? null,
      note_uo: body.note_uo ?? null,
      extra_data: body.extra_data ?? null,
    })

    writeChangeLog('nodo_org', String(body.id), body.nome_uo as string ?? null, 'CREATE', null, null, JSON.stringify(body))
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
