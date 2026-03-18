import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { cfs, decorrenza }: { cfs: string[]; decorrenza: string } = await req.json()
    if (!Array.isArray(cfs) || cfs.length === 0) {
      return NextResponse.json({ error: 'Nessun CF selezionato' }, { status: 400 })
    }
    if (!decorrenza) {
      return NextResponse.json({ error: 'Decorrenza obbligatoria' }, { status: 400 })
    }

    const d = db()
    let eliminati = 0
    let nodiChiusi = 0
    let supervisioniChiuse = 0
    const errors: string[] = []

    const runTransaction = d.transaction(() => {
      for (const cf of cfs) {
        try {
          const persona = d.prepare(
            'SELECT cf, cognome, nome FROM persone WHERE cf = ? AND deleted_at IS NULL'
          ).get(cf) as { cf: string; cognome: string | null; nome: string | null } | undefined

          if (!persona) {
            errors.push(`${cf}: non trovato o già eliminato`)
            continue
          }

          const label = `${persona.cognome ?? ''} ${persona.nome ?? ''}`.trim()

          // Soft-delete persona
          d.prepare(`
            UPDATE persone
            SET data_fine_rapporto=?, deleted_at=?, ultimo_aggiornamento=CURRENT_TIMESTAMP
            WHERE cf=?
          `).run(decorrenza, decorrenza, cf)
          writeChangeLog('persona', cf, label, 'DELETE', 'data_fine_rapporto', null, decorrenza)
          eliminati++

          // Chiudi nodi organigramma
          const updatedNodi = d.prepare(`
            UPDATE nodi_organigramma SET deleted_at=? WHERE cf_persona=? AND deleted_at IS NULL
          `).run(decorrenza, cf)
          if (updatedNodi.changes > 0) {
            writeChangeLog('nodo_org', cf, label, 'DELETE', null, null, `Verifica Dipendenti: uscita al ${decorrenza}`)
            nodiChiusi += updatedNodi.changes
          }

          // Chiudi supervisione timesheet
          const updatedSup = d.prepare(`
            UPDATE supervisioni_timesheet SET data_fine=? WHERE cf_dipendente=? AND data_fine IS NULL
          `).run(decorrenza, cf)
          if (updatedSup.changes > 0) supervisioniChiuse++

        } catch (e) {
          errors.push(`${cf}: ${String(e)}`)
        }
      }
    })

    runTransaction()

    return NextResponse.json({ success: true, eliminati, nodiChiusi, supervisioniChiuse, errors })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 400 })
  }
}
