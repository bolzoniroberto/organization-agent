import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Campi con valori statici noti (non richiedono query)
const STATIC_ENUMS: Record<string, string[]> = {
  sesso:             ['M', 'F'],
  tipo_nodo:         ['STRUTTURA', 'PERSONA', 'ANOMALIA'],
  modalita_presenze: ['F', 'T', 'E'],
}

// Campi da leggere live dal DB (tabella → colonna)
const DYNAMIC_ENUMS: { key: string; table: string; col: string }[] = [
  { key: 'societa',        table: 'persone',           col: 'societa' },
  { key: 'area',           table: 'persone',           col: 'area' },
  { key: 'sotto_area',     table: 'persone',           col: 'sotto_area' },
  { key: 'sede',           table: 'persone',           col: 'sede' },
  { key: 'qualifica',      table: 'persone',           col: 'qualifica' },
  { key: 'livello',        table: 'persone',           col: 'livello' },
  { key: 'tipo_contratto', table: 'persone',           col: 'tipo_contratto' },
  { key: 'gruppo_sind',    table: 'persone',           col: 'gruppo_sind' },
  { key: 'tipo_approvatore', table: 'persone',         col: 'tipo_approvatore' },
  { key: 'livello_tns',    table: 'persone',           col: 'livello_tns' },
  { key: 'sede_tns',       table: 'persone',           col: 'sede_tns' },
  { key: 'sede_nodo',      table: 'nodi_organigramma', col: 'sede' },
  { key: 'societa_org',    table: 'nodi_organigramma', col: 'societa_org' },
  { key: 'funzione',       table: 'nodi_organigramma', col: 'funzione' },
  { key: 'tipo_collab',    table: 'nodi_organigramma', col: 'tipo_collab' },
  { key: 'testata_gg',     table: 'nodi_organigramma', col: 'testata_gg' },
]

export async function GET() {
  const database = db()
  const result: Record<string, string[]> = { ...STATIC_ENUMS }

  for (const { key, table, col } of DYNAMIC_ENUMS) {
    try {
      const rows = database.prepare(
        `SELECT DISTINCT ${col} as v, COUNT(*) as n
         FROM ${table}
         WHERE ${col} IS NOT NULL AND ${col} != ''
         GROUP BY ${col}
         ORDER BY n DESC
         LIMIT 50`
      ).all() as { v: string; n: number }[]

      const values = rows.map(r => r.v).filter(Boolean)
      if (values.length > 0 && values.length <= 40) {
        result[key] = values
      }
      // If > 40 distinct values, field is free text — skip
    } catch {
      // Column might not exist yet
    }
  }

  return NextResponse.json(result)
}
