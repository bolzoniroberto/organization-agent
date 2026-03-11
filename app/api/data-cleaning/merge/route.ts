import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      entityType: 'persone' | 'nodi' | 'strutture-tns'
      survivorId: string
      victimId: string
      overrideFields?: Record<string, unknown>
    }

    const { entityType, survivorId, victimId, overrideFields = {} } = body
    if (!entityType || !survivorId || !victimId) {
      return NextResponse.json({ error: 'entityType, survivorId e victimId obbligatori' }, { status: 400 })
    }
    if (survivorId === victimId) {
      return NextResponse.json({ error: 'survivor e victim non possono essere uguali' }, { status: 400 })
    }

    const d = db()

    if (entityType === 'persone') {
      const survivor = d.prepare(`SELECT * FROM persone WHERE cf = ?`).get(survivorId) as Record<string, unknown> | undefined
      const victim = d.prepare(`SELECT * FROM persone WHERE cf = ?`).get(victimId) as Record<string, unknown> | undefined
      if (!survivor) return NextResponse.json({ error: `Survivor CF ${survivorId} non trovato` }, { status: 404 })
      if (!victim) return NextResponse.json({ error: `Victim CF ${victimId} non trovato` }, { status: 404 })

      // Copia campi non nulli dal victim al survivor (se non già valorizzati)
      const mergeable = ['cognome', 'nome', 'data_nascita', 'sesso', 'email', 'societa', 'area', 'sotto_area',
        'cdc_amministrativo', 'sede', 'data_assunzione', 'data_fine_rapporto', 'tipo_contratto', 'qualifica',
        'livello', 'modalita_presenze', 'part_time', 'ral', 'matricola']
      const updates: Record<string, unknown> = {}
      for (const field of mergeable) {
        if (overrideFields[field] !== undefined) {
          updates[field] = overrideFields[field]
        } else if ((survivor[field] === null || survivor[field] === '') && victim[field] !== null && victim[field] !== '') {
          updates[field] = victim[field]
        }
      }
      if (Object.keys(updates).length > 0) {
        const sets = Object.keys(updates).map(k => `${k} = @${k}`).join(', ')
        d.prepare(`UPDATE persone SET ${sets} WHERE cf = @cf`).run({ ...updates, cf: survivorId })
        for (const [field, newVal] of Object.entries(updates)) {
          writeChangeLog('persona', survivorId, String(survivor.cognome ?? ''), 'UPDATE', field, String(survivor[field] ?? ''), String(newVal ?? ''))
        }
      }

      // Aggiorna riferimenti: nodi_organigramma
      const nodiCount = (d.prepare(`SELECT COUNT(*) as c FROM nodi_organigramma WHERE cf_persona = ? AND deleted_at IS NULL`).get(victimId) as { c: number }).c
      if (nodiCount > 0) {
        d.prepare(`UPDATE nodi_organigramma SET cf_persona = ? WHERE cf_persona = ?`).run(survivorId, victimId)
        writeChangeLog('nodo', victimId, null, 'UPDATE', 'cf_persona', victimId, survivorId)
      }

      // Aggiorna supervisioni_timesheet (cf_dipendente e cf_supervisore)
      d.prepare(`UPDATE supervisioni_timesheet SET cf_dipendente = ? WHERE cf_dipendente = ?`).run(survivorId, victimId)
      d.prepare(`UPDATE supervisioni_timesheet SET cf_supervisore = ? WHERE cf_supervisore = ?`).run(survivorId, victimId)
      writeChangeLog('timesheet', victimId, null, 'UPDATE', 'cf_dipendente', victimId, survivorId)

      // Aggiorna ruoli_tns — TNS è univoco per CF:
      // se il survivor non ha già un ruolo_tns, sposta il victim; altrimenti cancella il victim
      const survivorTns = d.prepare(`SELECT cf_persona FROM ruoli_tns WHERE cf_persona = ?`).get(survivorId)
      if (!survivorTns) {
        d.prepare(`UPDATE ruoli_tns SET cf_persona = ? WHERE cf_persona = ?`).run(survivorId, victimId)
        writeChangeLog('ruolo_tns', victimId, null, 'UPDATE', 'cf_persona', victimId, survivorId)
      } else {
        d.prepare(`DELETE FROM ruoli_tns WHERE cf_persona = ?`).run(victimId)
        writeChangeLog('ruolo_tns', victimId, null, 'DELETE', null, null, `victim tns removed on merge into ${survivorId}`)
      }

      // Soft delete victim
      d.prepare(`UPDATE persone SET deleted_at = datetime('now') WHERE cf = ?`).run(victimId)
      writeChangeLog('persona', victimId, String(victim.cognome ?? ''), 'DELETE', null, null, `merged into ${survivorId}`)

    } else if (entityType === 'nodi') {
      const survivor = d.prepare(`SELECT * FROM nodi_organigramma WHERE id = ?`).get(survivorId) as Record<string, unknown> | undefined
      const victim = d.prepare(`SELECT * FROM nodi_organigramma WHERE id = ?`).get(victimId) as Record<string, unknown> | undefined
      if (!survivor) return NextResponse.json({ error: `Survivor nodo ${survivorId} non trovato` }, { status: 404 })
      if (!victim) return NextResponse.json({ error: `Victim nodo ${victimId} non trovato` }, { status: 404 })

      // Sposta i figli del victim al survivor
      d.prepare(`UPDATE nodi_organigramma SET reports_to = ? WHERE reports_to = ?`).run(survivorId, victimId)
      writeChangeLog('nodo', victimId, null, 'UPDATE', 'reports_to (children repointed)', victimId, survivorId)

      // Copia override fields
      if (Object.keys(overrideFields).length > 0) {
        const sets = Object.keys(overrideFields).map(k => `${k} = @${k}`).join(', ')
        d.prepare(`UPDATE nodi_organigramma SET ${sets} WHERE id = @id`).run({ ...overrideFields, id: survivorId })
        for (const [field, newVal] of Object.entries(overrideFields)) {
          writeChangeLog('nodo', survivorId, String(survivor.nome_uo ?? ''), 'UPDATE', field, String(survivor[field] ?? ''), String(newVal ?? ''))
        }
      }

      // Soft delete victim
      d.prepare(`UPDATE nodi_organigramma SET deleted_at = datetime('now') WHERE id = ?`).run(victimId)
      writeChangeLog('nodo', victimId, String(victim.nome_uo ?? ''), 'DELETE', null, null, `merged into ${survivorId}`)

    } else {
      // strutture-tns
      const survivor = d.prepare(`SELECT * FROM strutture_tns WHERE codice = ?`).get(survivorId) as Record<string, unknown> | undefined
      const victim = d.prepare(`SELECT * FROM strutture_tns WHERE codice = ?`).get(victimId) as Record<string, unknown> | undefined
      if (!survivor) return NextResponse.json({ error: `Survivor struttura ${survivorId} non trovata` }, { status: 404 })
      if (!victim) return NextResponse.json({ error: `Victim struttura ${victimId} non trovata` }, { status: 404 })

      // Aggiorna figli
      d.prepare(`UPDATE strutture_tns SET padre = ? WHERE padre = ?`).run(survivorId, victimId)
      writeChangeLog('struttura_tns', victimId, null, 'UPDATE', 'padre (children repointed)', victimId, survivorId)

      // Override fields
      if (Object.keys(overrideFields).length > 0) {
        const sets = Object.keys(overrideFields).map(k => `${k} = @${k}`).join(', ')
        d.prepare(`UPDATE strutture_tns SET ${sets} WHERE codice = @codice`).run({ ...overrideFields, codice: survivorId })
        for (const [field, newVal] of Object.entries(overrideFields)) {
          writeChangeLog('struttura_tns', survivorId, String(survivor.nome ?? ''), 'UPDATE', field, String(survivor[field] ?? ''), String(newVal ?? ''))
        }
      }

      // Delete victim (strutture_tns usa delete diretto, nessun deleted_at)
      d.prepare(`DELETE FROM strutture_tns WHERE codice = ?`).run(victimId)
      writeChangeLog('struttura_tns', victimId, String(victim.nome ?? ''), 'DELETE', null, null, `merged into ${survivorId}`)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
