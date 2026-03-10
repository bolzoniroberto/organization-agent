import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function GET() {
  try {
    const d = db()
    const rows = d.prepare('SELECT * FROM strutture_tns ORDER BY codice').all()
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { codice, nome, padre, livello, tipo, descrizione, attivo, cdc, titolare, cf_titolare, sede_tns,
      viaggiatore, approvatore, cassiere, visualizzatore, segretario, controllore, amministrazione,
      ruoli_oltrv, ruoli, segr_redaz, segreteria_red_asst, segretario_asst, controllore_asst,
      ruoli_afc, ruoli_hr, altri_ruoli, gruppo_sind } = body

    if (!codice) return NextResponse.json({ success: false, error: 'codice obbligatorio' }, { status: 400 })

    const d = db()
    d.prepare(`
      INSERT INTO strutture_tns (codice, nome, padre, livello, tipo, descrizione, attivo, cdc, titolare,
        cf_titolare, sede_tns, viaggiatore, approvatore, cassiere, visualizzatore, segretario,
        controllore, amministrazione, ruoli_oltrv, ruoli, segr_redaz, segreteria_red_asst,
        segretario_asst, controllore_asst, ruoli_afc, ruoli_hr, altri_ruoli, gruppo_sind)
      VALUES (@codice, @nome, @padre, @livello, @tipo, @descrizione, @attivo, @cdc, @titolare,
        @cf_titolare, @sede_tns, @viaggiatore, @approvatore, @cassiere, @visualizzatore, @segretario,
        @controllore, @amministrazione, @ruoli_oltrv, @ruoli, @segr_redaz, @segreteria_red_asst,
        @segretario_asst, @controllore_asst, @ruoli_afc, @ruoli_hr, @altri_ruoli, @gruppo_sind)
    `).run({
      codice, nome: nome ?? null, padre: padre ?? null, livello: livello ?? null, tipo: tipo ?? null,
      descrizione: descrizione ?? null, attivo: attivo ?? 1, cdc: cdc ?? null, titolare: titolare ?? null,
      cf_titolare: cf_titolare ?? null, sede_tns: sede_tns ?? null, viaggiatore: viaggiatore ?? null,
      approvatore: approvatore ?? null, cassiere: cassiere ?? null, visualizzatore: visualizzatore ?? null,
      segretario: segretario ?? null, controllore: controllore ?? null, amministrazione: amministrazione ?? null,
      ruoli_oltrv: ruoli_oltrv ?? null, ruoli: ruoli ?? null, segr_redaz: segr_redaz ?? null,
      segreteria_red_asst: segreteria_red_asst ?? null, segretario_asst: segretario_asst ?? null,
      controllore_asst: controllore_asst ?? null, ruoli_afc: ruoli_afc ?? null, ruoli_hr: ruoli_hr ?? null,
      altri_ruoli: altri_ruoli ?? null, gruppo_sind: gruppo_sind ?? null,
    })

    writeChangeLog('struttura_tns', codice, nome ?? codice, 'CREATE', null, null, null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
