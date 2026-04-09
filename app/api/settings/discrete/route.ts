import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Campi nativi con valori discreti significativi
const DISCRETE_FIELDS: { table: string; field: string; label: string; entity: string }[] = [
  { table: 'persone',            field: 'qualifica',         label: 'Qualifica',          entity: 'persona' },
  { table: 'persone',            field: 'sede',              label: 'Sede (persona)',      entity: 'persona' },
  { table: 'persone',            field: 'societa',           label: 'Società',            entity: 'persona' },
  { table: 'persone',            field: 'area',              label: 'Area',               entity: 'persona' },
  { table: 'persone',            field: 'tipo_contratto',    label: 'Tipo Contratto',     entity: 'persona' },
  { table: 'persone',            field: 'sesso',             label: 'Sesso',              entity: 'persona' },
  { table: 'persone',            field: 'modalita_presenze', label: 'Modalità Presenze',  entity: 'persona' },
  { table: 'persone',            field: 'livello',           label: 'Livello',            entity: 'persona' },
  { table: 'nodi_organigramma',  field: 'sede',              label: 'Sede (nodo)',        entity: 'nodo' },
  { table: 'nodi_organigramma',  field: 'tipo_nodo',         label: 'Tipo Nodo',          entity: 'nodo' },
  { table: 'nodi_organigramma',  field: 'funzione',          label: 'Funzione',           entity: 'nodo' },
  { table: 'nodi_organigramma',  field: 'societa_org',       label: 'Società Org',        entity: 'nodo' },
]

export async function GET() {
  const result = DISCRETE_FIELDS.map(f => {
    try {
      const rows = db().prepare(
        `SELECT DISTINCT ${f.field} FROM ${f.table} WHERE deleted_at IS NULL AND ${f.field} IS NOT NULL AND ${f.field} != '' ORDER BY ${f.field}`
      ).all() as Record<string, string>[]
      return {
        ...f,
        values: rows.map(r => r[f.field]).filter(Boolean),
      }
    } catch {
      return { ...f, values: [] }
    }
  })
  return NextResponse.json({ fields: result })
}
