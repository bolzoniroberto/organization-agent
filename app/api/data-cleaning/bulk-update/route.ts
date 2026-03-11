import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

const ALLOWED_FIELDS: Record<string, string[]> = {
  persone: ['cognome', 'nome', 'email', 'societa', 'area', 'sotto_area', 'cdc_amministrativo', 'sede', 'tipo_contratto', 'qualifica', 'livello', 'modalita_presenze'],
  nodi: ['nome_uo', 'nome_uo_2', 'centro_costo', 'funzione', 'processo', 'sede', 'societa_org', 'tipo_collab', 'job_title'],
  'strutture-tns': ['nome', 'livello', 'tipo', 'descrizione', 'cdc', 'sede_tns'],
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      entityType: 'persone' | 'nodi' | 'strutture-tns'
      ids: string[]
      field: string
      value: string | null
    }

    const { entityType, ids, field, value } = body
    if (!entityType || !ids?.length || !field) {
      return NextResponse.json({ error: 'entityType, ids e field obbligatori' }, { status: 400 })
    }

    const allowed = ALLOWED_FIELDS[entityType]
    if (!allowed?.includes(field)) {
      return NextResponse.json({ error: `Campo "${field}" non modificabile per entità "${entityType}"` }, { status: 400 })
    }

    const d = db()
    let table: string, idCol: string, labelCols: string[]
    if (entityType === 'persone') {
      table = 'persone'; idCol = 'cf'; labelCols = ['cognome', 'nome']
    } else if (entityType === 'nodi') {
      table = 'nodi_organigramma'; idCol = 'id'; labelCols = ['nome_uo']
    } else {
      table = 'strutture_tns'; idCol = 'codice'; labelCols = ['nome']
    }

    let updated = 0
    const errors: string[] = []

    for (const id of ids) {
      try {
        const existing = d.prepare(`SELECT * FROM ${table} WHERE ${idCol} = ?`).get(id) as Record<string, unknown> | undefined
        if (!existing) { errors.push(`Record non trovato: ${id}`); continue }

        const oldValue = existing[field] !== undefined ? String(existing[field] ?? '') : null
        d.prepare(`UPDATE ${table} SET ${field} = ? WHERE ${idCol} = ?`).run(value, id)

        const label = labelCols.map(c => existing[c] ?? '').join(' ').trim() || null
        writeChangeLog(entityType, id, label, 'UPDATE', field, oldValue, value)
        updated++
      } catch (e) {
        errors.push(`Errore su ${id}: ${String(e)}`)
      }
    }

    return NextResponse.json({ updated, errors })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
