import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { db } from '@/lib/db'

function str(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim()
  return s || null
}

function parseDate(v: unknown): string | null {
  const s = str(v)
  if (!s) return null
  const parts = s.split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Nessun file' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buffer, { type: 'buffer' })

    const sheetName = wb.SheetNames.includes('DB') ? 'DB' : wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]

    // Parse all rows into persona shapes
    const fromFile = rows
      .map(r => ({
        cf:                str(r['Codice Fiscale']),
        cognome:           str(r['Cognome']),
        nome:              str(r['Nome']),
        sesso:             str(r['Sesso']),
        data_nascita:      parseDate(r['Data di nascita']),
        societa:           str(r['Azienda']),
        area:              str(r['Descrizione struttura - livello 1']),
        sotto_area:        str(r['Descrizione struttura - livello 2']),
        cdc_amministrativo: str(r['Codice centro di costo']),
        sede:              str(r['Comune sede']) ?? str(r['Descrizione sede']),
        tipo_contratto:    str(r['Descrizione contratto']),
        qualifica:         str(r['Descrizione qualifica']),
        livello:           str(r['Descrizione livello']),
        data_assunzione:   parseDate(r['Data assunzione']),
        data_fine_rapporto: parseDate(r['Data cessazione']),
        email:             str(r['INDIRIZZO EMAIL']),
        part_time:         r['300 - % Ptime'] != null ? Number(r['300 - % Ptime']) : 100,
        matricola:         str(r['Matricola']) ?? str(r['Codice dipendente']),
      }))
      .filter(p => p.cf && p.cf.length >= 10)

    const allCFs = fromFile.map(p => p.cf!)

    // Query DB for all those CFs at once
    const placeholders = allCFs.map(() => '?').join(',')
    const dbRows = allCFs.length > 0
      ? (db().prepare(
          `SELECT cf, deleted_at FROM persone WHERE cf IN (${placeholders})`
        ).all(...allCFs) as { cf: string; deleted_at: string | null }[])
      : []

    const inDb = new Map(dbRows.map(r => [r.cf, r.deleted_at]))

    const presenti: string[]          = []
    const mancanti: typeof fromFile   = []
    const daRipristinare: typeof fromFile = []

    for (const p of fromFile) {
      const cf = p.cf!
      if (!inDb.has(cf)) {
        mancanti.push(p)
      } else if (inDb.get(cf) !== null) {
        daRipristinare.push(p)
      } else {
        presenti.push(cf)
      }
    }

    // Verifica inversa: persone attive nel DB non presenti nei puntuali
    const cfInPuntuali = new Set(allCFs)
    const soloInDb = (db().prepare(
      `SELECT cf, cognome, nome, societa, area, sotto_area, qualifica,
              data_assunzione, data_fine_rapporto, sede, tipo_contratto, livello
       FROM persone WHERE deleted_at IS NULL`
    ).all() as Record<string, string | null>[]).filter(p => !cfInPuntuali.has(p.cf!))

    return NextResponse.json({
      totale: fromFile.length,
      nPresenti: presenti.length,
      mancanti,
      daRipristinare,
      soloInDb,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
