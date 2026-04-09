import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

const ALLOWED: Record<string, { table: string; idCol: string; labelCols: string[]; entityType: string }> = {
  'persone.qualifica':         { table: 'persone', idCol: 'cf', labelCols: ['cognome', 'nome'], entityType: 'persona' },
  'persone.sede':              { table: 'persone', idCol: 'cf', labelCols: ['cognome', 'nome'], entityType: 'persona' },
  'persone.societa':           { table: 'persone', idCol: 'cf', labelCols: ['cognome', 'nome'], entityType: 'persona' },
  'persone.area':              { table: 'persone', idCol: 'cf', labelCols: ['cognome', 'nome'], entityType: 'persona' },
  'persone.tipo_contratto':    { table: 'persone', idCol: 'cf', labelCols: ['cognome', 'nome'], entityType: 'persona' },
  'persone.sesso':             { table: 'persone', idCol: 'cf', labelCols: ['cognome', 'nome'], entityType: 'persona' },
  'persone.modalita_presenze': { table: 'persone', idCol: 'cf', labelCols: ['cognome', 'nome'], entityType: 'persona' },
  'persone.livello':           { table: 'persone', idCol: 'cf', labelCols: ['cognome', 'nome'], entityType: 'persona' },
  'nodi_organigramma.sede':       { table: 'nodi_organigramma', idCol: 'id', labelCols: ['nome_uo'], entityType: 'nodo_org' },
  'nodi_organigramma.tipo_nodo':  { table: 'nodi_organigramma', idCol: 'id', labelCols: ['nome_uo'], entityType: 'nodo_org' },
  'nodi_organigramma.funzione':   { table: 'nodi_organigramma', idCol: 'id', labelCols: ['nome_uo'], entityType: 'nodo_org' },
  'nodi_organigramma.societa_org':{ table: 'nodi_organigramma', idCol: 'id', labelCols: ['nome_uo'], entityType: 'nodo_org' },
}

export async function POST(req: NextRequest) {
  try {
    const { table, field, old_value, new_value } = await req.json() as {
      table: string
      field: string
      old_value: string
      new_value: string
    }

    if (!table || !field || old_value === undefined || old_value === null || !new_value) {
      return NextResponse.json({ error: 'table, field, old_value e new_value obbligatori' }, { status: 400 })
    }

    const key = `${table}.${field}`
    const meta = ALLOWED[key]
    if (!meta) {
      return NextResponse.json({ error: `Campo "${key}" non modificabile` }, { status: 400 })
    }

    const d = db()
    const rows = d.prepare(
      `SELECT ${meta.idCol} as id, ${meta.labelCols.map(c => c).join(', ')} FROM ${meta.table} WHERE deleted_at IS NULL AND ${field} = ?`
    ).all(old_value) as Record<string, string>[]

    if (rows.length === 0) {
      return NextResponse.json({ updated: 0 })
    }

    const stmt = d.prepare(`UPDATE ${meta.table} SET ${field} = ? WHERE ${meta.idCol} = ?`)
    let updated = 0

    for (const row of rows) {
      stmt.run(new_value, row.id)
      const label = meta.labelCols.map(c => row[c] ?? '').join(' ').trim() || null
      writeChangeLog(meta.entityType, row.id, label, 'UPDATE', field, old_value, new_value)
      updated++
    }

    return NextResponse.json({ updated })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
