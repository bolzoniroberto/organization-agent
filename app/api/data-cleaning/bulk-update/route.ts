import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

const ALLOWED_FIELDS: Record<string, string[]> = {
  persone: ['cognome', 'nome', 'email', 'societa', 'area', 'sotto_area', 'cdc_amministrativo', 'sede', 'tipo_contratto', 'qualifica', 'livello', 'modalita_presenze'],
  nodi: ['nome_uo', 'nome_uo_2', 'centro_costo', 'funzione', 'processo', 'sede', 'societa_org', 'tipo_collab', 'job_title'],
  'strutture-tns': ['nome', 'livello', 'tipo', 'descrizione', 'cdc', 'sede_tns'],
}

const ENTITY_TIPO: Record<string, string> = {
  persone: 'persona',
  nodi: 'nodo_org',
  'strutture-tns': 'struttura_tns',
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

    const d = db()
    let updated = 0
    const errors: string[] = []

    // Handle variabili integrative (var_N fields)
    if (field.startsWith('var_')) {
      const varId = parseInt(field.slice(4), 10)
      if (isNaN(varId)) return NextResponse.json({ error: 'var_id non valido' }, { status: 400 })
      const varDef = d.prepare('SELECT * FROM variabili_org_definizioni WHERE id = ?').get(varId) as { nome: string; label: string } | undefined
      if (!varDef) return NextResponse.json({ error: `Variabile ${varId} non trovata` }, { status: 400 })

      const entitaTipo = ENTITY_TIPO[entityType]
      const upsert = d.prepare(`INSERT INTO variabili_org_valori (entita_tipo, entita_id, var_id, valore, updated_at)
        VALUES (@entita_tipo, @entita_id, @var_id, @valore, CURRENT_TIMESTAMP)
        ON CONFLICT(entita_tipo, entita_id, var_id) DO UPDATE SET valore = excluded.valore, updated_at = CURRENT_TIMESTAMP`)

      for (const id of ids) {
        try {
          const old = d.prepare('SELECT valore FROM variabili_org_valori WHERE entita_tipo = ? AND entita_id = ? AND var_id = ?').get(entitaTipo, id, varId) as { valore: string | null } | undefined
          upsert.run({ entita_tipo: entitaTipo, entita_id: id, var_id: varId, valore: value })
          writeChangeLog(entityType, id, null, 'UPDATE', varDef.nome, old?.valore ?? null, value)
          updated++
        } catch (e) {
          errors.push(`Errore su ${id}: ${String(e)}`)
        }
      }
      return NextResponse.json({ updated, errors })
    }

    // Handle native fields
    const allowed = ALLOWED_FIELDS[entityType]
    if (!allowed?.includes(field)) {
      return NextResponse.json({ error: `Campo "${field}" non modificabile per entità "${entityType}"` }, { status: 400 })
    }

    let table: string, idCol: string, labelCols: string[]
    if (entityType === 'persone') {
      table = 'persone'; idCol = 'cf'; labelCols = ['cognome', 'nome']
    } else if (entityType === 'nodi') {
      table = 'nodi_organigramma'; idCol = 'id'; labelCols = ['nome_uo']
    } else {
      table = 'strutture_tns'; idCol = 'codice'; labelCols = ['nome']
    }

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
