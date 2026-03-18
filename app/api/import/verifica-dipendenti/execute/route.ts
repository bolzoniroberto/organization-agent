import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

interface PersonaInput {
  cf: string
  cognome: string | null
  nome: string | null
  sesso: string | null
  data_nascita: string | null
  societa: string | null
  area: string | null
  sotto_area: string | null
  cdc_amministrativo: string | null
  sede: string | null
  tipo_contratto: string | null
  qualifica: string | null
  livello: string | null
  data_assunzione: string | null
  data_fine_rapporto: string | null
  email: string | null
  part_time: number
  matricola: string | null
}

export async function POST(req: NextRequest) {
  try {
    const { persone }: { persone: PersonaInput[] } = await req.json()
    if (!Array.isArray(persone) || persone.length === 0) {
      return NextResponse.json({ error: 'Nessuna persona selezionata' }, { status: 400 })
    }

    const d = db()
    let importati = 0
    let ripristinati = 0
    const errors: string[] = []

    const runTransaction = d.transaction(() => {
      for (const p of persone) {
        try {
          const label = `${p.cognome ?? ''} ${p.nome ?? ''}`.trim()
          const existing = d.prepare(
            'SELECT cf, deleted_at FROM persone WHERE cf = ?'
          ).get(p.cf) as { cf: string; deleted_at: string | null } | undefined

          if (existing) {
            // Restore: clear deleted_at, update fields
            d.prepare(`
              UPDATE persone SET
                cognome=?, nome=?, sesso=?, data_nascita=?,
                societa=?, area=?, sotto_area=?, cdc_amministrativo=?,
                sede=?, tipo_contratto=?, qualifica=?, livello=?,
                email=?, part_time=?, data_assunzione=?,
                data_fine_rapporto=?, matricola=?,
                deleted_at=NULL, ultimo_aggiornamento=CURRENT_TIMESTAMP
              WHERE cf=?
            `).run(
              p.cognome, p.nome, p.sesso, p.data_nascita,
              p.societa, p.area, p.sotto_area, p.cdc_amministrativo,
              p.sede, p.tipo_contratto, p.qualifica, p.livello,
              p.email, p.part_time, p.data_assunzione,
              p.data_fine_rapporto, p.matricola,
              p.cf
            )
            writeChangeLog('persona', p.cf, label, 'RESTORE', null, null, 'Verifica Dipendenti')
            ripristinati++
          } else {
            d.prepare(`
              INSERT INTO persone
                (cf, cognome, nome, sesso, data_nascita, societa, area, sotto_area,
                 cdc_amministrativo, sede, tipo_contratto, qualifica, livello,
                 email, part_time, data_assunzione, data_fine_rapporto, matricola, extra_data)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            `).run(
              p.cf, p.cognome, p.nome, p.sesso, p.data_nascita,
              p.societa, p.area, p.sotto_area, p.cdc_amministrativo,
              p.sede, p.tipo_contratto, p.qualifica, p.livello,
              p.email, p.part_time, p.data_assunzione,
              p.data_fine_rapporto, p.matricola, '{}'
            )
            writeChangeLog('persona', p.cf, label, 'CREATE', null, null, 'Verifica Dipendenti')
            importati++
          }
        } catch (e) {
          errors.push(`${p.cf}: ${String(e)}`)
        }
      }
    })

    runTransaction()

    return NextResponse.json({ success: true, importati, ripristinati, errors })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 400 })
  }
}
