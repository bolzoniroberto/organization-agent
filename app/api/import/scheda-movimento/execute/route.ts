import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

interface PersonaFields {
  cf: string
  cognome: string
  nome: string
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
  email: string | null
  ral: number | null
  part_time: number
  data_assunzione: string | null
  data_fine_rapporto: string | null
  matricola: string | null
  extra_data: Record<string, unknown>
}

interface SupervisioneFields {
  cf_supervisore: string | null
}

interface ExecuteBody {
  tipoMovimento: string
  decorrenza: string
  persona: PersonaFields
  supervisione: SupervisioneFields | null
}

export async function POST(req: NextRequest) {
  try {
    const body: ExecuteBody = await req.json()
    const { tipoMovimento, decorrenza, persona, supervisione } = body
    const actions: string[] = []
    const d = db()

    const label = `${persona.cognome ?? ''} ${persona.nome ?? ''}`.trim()
    const extraJson = JSON.stringify(persona.extra_data ?? {})

    const runTransaction = d.transaction(() => {

      if (tipoMovimento === 'INGRESSO' || tipoMovimento === 'INGRESSO CON DISTACCO') {
        const existing = d.prepare('SELECT cf, deleted_at FROM persone WHERE cf = ?').get(persona.cf) as
          | { cf: string; deleted_at: string | null } | undefined

        if (existing) {
          d.prepare(`
            UPDATE persone SET
              cognome=?, nome=?, sesso=?, data_nascita=?,
              societa=?, area=?, sotto_area=?, cdc_amministrativo=?,
              sede=?, tipo_contratto=?, qualifica=?, livello=?,
              email=?, ral=?, part_time=?, data_assunzione=?,
              data_fine_rapporto=NULL, matricola=?,
              extra_data=?, deleted_at=NULL,
              ultimo_aggiornamento=CURRENT_TIMESTAMP
            WHERE cf=?
          `).run(
            persona.cognome, persona.nome, persona.sesso, persona.data_nascita,
            persona.societa, persona.area, persona.sotto_area, persona.cdc_amministrativo,
            persona.sede, persona.tipo_contratto, persona.qualifica, persona.livello,
            persona.email, persona.ral, persona.part_time, decorrenza,
            persona.matricola, extraJson, persona.cf
          )
          const action = existing.deleted_at ? 'RESTORE' : 'UPDATE'
          writeChangeLog('persona', persona.cf, label, action, null, null, 'Da Scheda Movimenti')
          actions.push(`Persona ${action === 'RESTORE' ? 'ripristinata' : 'aggiornata'}: ${label}`)
        } else {
          d.prepare(`
            INSERT INTO persone
              (cf, cognome, nome, sesso, data_nascita, societa, area, sotto_area,
               cdc_amministrativo, sede, tipo_contratto, qualifica, livello,
               email, ral, part_time, data_assunzione, matricola, extra_data)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `).run(
            persona.cf, persona.cognome, persona.nome, persona.sesso, persona.data_nascita,
            persona.societa, persona.area, persona.sotto_area, persona.cdc_amministrativo,
            persona.sede, persona.tipo_contratto, persona.qualifica, persona.livello,
            persona.email, persona.ral, persona.part_time, decorrenza,
            persona.matricola, extraJson
          )
          writeChangeLog('persona', persona.cf, label, 'CREATE', null, null, 'Da Scheda Movimenti')
          actions.push(`Persona creata: ${label} (${persona.cf}) — non ancora posizionata in organigramma`)
        }

        // Supervisione timesheet (opzionale)
        if (supervisione) {
          const existingSup = d.prepare(
            'SELECT cf_dipendente FROM supervisioni_timesheet WHERE cf_dipendente = ?'
          ).get(persona.cf)
          if (existingSup) {
            d.prepare(`
              UPDATE supervisioni_timesheet
              SET cf_supervisore=?, data_inizio=?, data_fine=NULL
              WHERE cf_dipendente=?
            `).run(supervisione.cf_supervisore, decorrenza, persona.cf)
            actions.push(`Supervisione aggiornata`)
          } else {
            d.prepare(`
              INSERT INTO supervisioni_timesheet (cf_dipendente, cf_supervisore, data_inizio)
              VALUES (?,?,?)
            `).run(persona.cf, supervisione.cf_supervisore, decorrenza)
            actions.push(
              `Supervisione registrata${supervisione.cf_supervisore ? ` → ${supervisione.cf_supervisore}` : ' (senza supervisore)'}`
            )
          }
          writeChangeLog('supervisione', persona.cf, label, 'IMPORT', 'cf_supervisore', null, supervisione.cf_supervisore)
        }

      } else if (tipoMovimento === 'USCITA') {
        const existing = d.prepare(
          'SELECT cf FROM persone WHERE cf = ? AND deleted_at IS NULL'
        ).get(persona.cf)
        if (!existing) throw new Error(`CF ${persona.cf} non trovato tra le persone attive`)

        d.prepare(`
          UPDATE persone
          SET data_fine_rapporto=?, deleted_at=?, ultimo_aggiornamento=CURRENT_TIMESTAMP
          WHERE cf=?
        `).run(decorrenza, decorrenza, persona.cf)
        writeChangeLog('persona', persona.cf, label, 'DELETE', 'data_fine_rapporto', null, decorrenza)
        actions.push(`Persona uscita: ${label} al ${decorrenza}`)

        const updatedNodi = d.prepare(`
          UPDATE nodi_organigramma SET deleted_at=? WHERE cf_persona=? AND deleted_at IS NULL
        `).run(decorrenza, persona.cf)
        if (updatedNodi.changes > 0) {
          writeChangeLog('nodo_org', persona.cf, label, 'DELETE', null, null, `Uscita al ${decorrenza}`)
          actions.push(`${updatedNodi.changes} nodo/i organigramma chiusi`)
        }

        const updatedSup = d.prepare(`
          UPDATE supervisioni_timesheet SET data_fine=? WHERE cf_dipendente=? AND data_fine IS NULL
        `).run(decorrenza, persona.cf)
        if (updatedSup.changes > 0) actions.push(`Supervisione chiusa`)

      } else if (
        tipoMovimento === 'TRASFERIMENTO' ||
        tipoMovimento === 'CAMBIO CONTRATTO' ||
        tipoMovimento === 'TRASFORMAZIONE CONTRATTO'
      ) {
        const existing = d.prepare(
          'SELECT cf FROM persone WHERE cf = ? AND deleted_at IS NULL'
        ).get(persona.cf)
        if (!existing) throw new Error(`CF ${persona.cf} non trovato tra le persone attive`)

        d.prepare(`
          UPDATE persone SET
            societa=?, area=?, sotto_area=?, cdc_amministrativo=?,
            sede=?, tipo_contratto=?, qualifica=?, livello=?,
            ultimo_aggiornamento=CURRENT_TIMESTAMP
          WHERE cf=?
        `).run(
          persona.societa, persona.area, persona.sotto_area, persona.cdc_amministrativo,
          persona.sede, persona.tipo_contratto, persona.qualifica, persona.livello,
          persona.cf
        )
        writeChangeLog('persona', persona.cf, label, 'UPDATE', null, null, `Scheda Movimenti: ${tipoMovimento}`)
        actions.push(`Persona aggiornata (${tipoMovimento}): ${label}`)

      } else if (tipoMovimento === 'PROROGA' || tipoMovimento === 'PROROGA DISTACCO') {
        const existing = d.prepare(
          'SELECT cf FROM persone WHERE cf = ? AND deleted_at IS NULL'
        ).get(persona.cf)
        if (!existing) throw new Error(`CF ${persona.cf} non trovato tra le persone attive`)

        d.prepare(`
          UPDATE persone SET data_fine_rapporto=?, ultimo_aggiornamento=CURRENT_TIMESTAMP WHERE cf=?
        `).run(persona.data_fine_rapporto, persona.cf)
        writeChangeLog('persona', persona.cf, label, 'UPDATE', 'data_fine_rapporto', null, persona.data_fine_rapporto)
        actions.push(`Proroga registrata fino al ${persona.data_fine_rapporto ?? 'n.d.'}`)

      } else {
        throw new Error(`Tipo movimento non gestito: ${tipoMovimento}`)
      }
    })

    runTransaction()
    return NextResponse.json({ success: true, actions })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 400 })
  }
}
