import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'
import type { OrdineServizioProposal } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const { proposte } = await req.json() as { proposte: OrdineServizioProposal[] }
    if (!Array.isArray(proposte) || proposte.length === 0) {
      return NextResponse.json({ error: 'Nessuna proposta da applicare' }, { status: 400 })
    }

    const database = db()
    const now = new Date().toISOString()
    let applied = 0
    const errors: string[] = []

    for (const p of proposte) {
      try {
        switch (p.tipo) {
          case 'INSERT_PERSONA': {
            const d = p.data as Record<string, unknown>
            const cf = (d.cf ?? p.entityId) as string
            if (!cf) { errors.push(`INSERT_PERSONA senza CF: ${p.label}`); break }
            const cols = Object.keys(d).join(', ')
            const placeholders = Object.keys(d).map(() => '?').join(', ')
            database.prepare(`INSERT OR IGNORE INTO persone (${cols}) VALUES (${placeholders})`).run(...Object.values(d))
            writeChangeLog('persona', cf, p.entityLabel ?? null, 'AGENT_SUGGEST', null, null, JSON.stringify(d))
            applied++
            break
          }

          case 'UPDATE_PERSONA': {
            const cf = p.entityId
            if (!cf) { errors.push(`UPDATE_PERSONA senza CF: ${p.label}`); break }
            const d = p.data as Record<string, unknown>
            const old = database.prepare('SELECT * FROM persone WHERE cf = ?').get(cf) as Record<string, unknown> | undefined
            for (const [field, newVal] of Object.entries(d)) {
              database.prepare(`UPDATE persone SET ${field} = ? WHERE cf = ?`).run(newVal, cf)
              writeChangeLog('persona', cf, p.entityLabel ?? null, 'AGENT_SUGGEST', field, old?.[field] != null ? String(old[field]) : null, newVal != null ? String(newVal) : null)
            }
            applied++
            break
          }

          case 'DELETE_PERSONA': {
            const cf = p.entityId
            if (!cf) { errors.push(`DELETE_PERSONA senza CF: ${p.label}`); break }
            database.prepare('UPDATE persone SET deleted_at = ? WHERE cf = ?').run(now, cf)
            writeChangeLog('persona', cf, p.entityLabel ?? null, 'AGENT_SUGGEST', 'deleted_at', null, now)
            applied++
            break
          }

          case 'INSERT_NODO': {
            const d = p.data as Record<string, unknown>
            const id = (d.id ?? p.entityId) as string
            if (!id) { errors.push(`INSERT_NODO senza ID: ${p.label}`); break }
            const cols = Object.keys(d).join(', ')
            const placeholders = Object.keys(d).map(() => '?').join(', ')
            database.prepare(`INSERT OR IGNORE INTO nodi_organigramma (${cols}) VALUES (${placeholders})`).run(...Object.values(d))
            writeChangeLog('nodo', id, p.entityLabel ?? null, 'AGENT_SUGGEST', null, null, JSON.stringify(d))
            applied++
            break
          }

          case 'UPDATE_NODO': {
            const id = p.entityId
            if (!id) { errors.push(`UPDATE_NODO senza ID: ${p.label}`); break }
            const d = p.data as Record<string, unknown>
            const old = database.prepare('SELECT * FROM nodi_organigramma WHERE id = ?').get(id) as Record<string, unknown> | undefined
            for (const [field, newVal] of Object.entries(d)) {
              database.prepare(`UPDATE nodi_organigramma SET ${field} = ? WHERE id = ?`).run(newVal, id)
              writeChangeLog('nodo', id, p.entityLabel ?? null, 'AGENT_SUGGEST', field, old?.[field] != null ? String(old[field]) : null, newVal != null ? String(newVal) : null)
            }
            applied++
            break
          }

          case 'REPARENT_NODO': {
            const id = p.entityId
            if (!id) { errors.push(`REPARENT_NODO senza ID: ${p.label}`); break }
            const d = p.data as { reports_to: string }
            const old = database.prepare('SELECT reports_to FROM nodi_organigramma WHERE id = ?').get(id) as { reports_to?: string } | undefined
            database.prepare('UPDATE nodi_organigramma SET reports_to = ? WHERE id = ?').run(d.reports_to, id)
            writeChangeLog('nodo', id, p.entityLabel ?? null, 'AGENT_SUGGEST', 'reports_to', old?.reports_to ?? null, d.reports_to)
            applied++
            break
          }

          case 'UPDATE_RUOLO_TNS': {
            const cf = p.entityId
            if (!cf) { errors.push(`UPDATE_RUOLO_TNS senza CF: ${p.label}`); break }
            const d = p.data as Record<string, unknown>
            const old = database.prepare('SELECT * FROM persone WHERE cf = ?').get(cf) as Record<string, unknown> | undefined
            for (const [field, newVal] of Object.entries(d)) {
              database.prepare(`UPDATE persone SET ${field} = ? WHERE cf = ?`).run(newVal, cf)
              writeChangeLog('persona', cf, p.entityLabel ?? null, 'AGENT_SUGGEST', field, old?.[field] != null ? String(old[field]) : null, newVal != null ? String(newVal) : null)
            }
            applied++
            break
          }

          case 'INSERT_STRUTTURA_TNS': {
            const d = p.data as Record<string, unknown>
            const codice = (d.codice ?? p.entityId) as string
            if (!codice) { errors.push(`INSERT_STRUTTURA_TNS senza codice: ${p.label}`); break }
            const cols = Object.keys(d).join(', ')
            const placeholders = Object.keys(d).map(() => '?').join(', ')
            database.prepare(`INSERT OR IGNORE INTO strutture_tns (${cols}) VALUES (${placeholders})`).run(...Object.values(d))
            writeChangeLog('struttura_tns', codice, p.entityLabel ?? null, 'AGENT_SUGGEST', null, null, JSON.stringify(d))
            applied++
            break
          }

          case 'UPDATE_STRUTTURA_TNS': {
            const codice = p.entityId
            if (!codice) { errors.push(`UPDATE_STRUTTURA_TNS senza codice: ${p.label}`); break }
            const d = p.data as Record<string, unknown>
            const old = database.prepare('SELECT * FROM strutture_tns WHERE codice = ?').get(codice) as Record<string, unknown> | undefined
            for (const [field, newVal] of Object.entries(d)) {
              database.prepare(`UPDATE strutture_tns SET ${field} = ? WHERE codice = ?`).run(newVal, codice)
              writeChangeLog('struttura_tns', codice, p.entityLabel ?? null, 'AGENT_SUGGEST', field, old?.[field] != null ? String(old[field]) : null, newVal != null ? String(newVal) : null)
            }
            applied++
            break
          }

          default:
            errors.push(`Tipo proposta sconosciuto: ${(p as OrdineServizioProposal).tipo}`)
        }
      } catch (err) {
        errors.push(`Errore su "${p.label}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return NextResponse.json({ applied, errors })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
