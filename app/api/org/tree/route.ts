import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const rows = db().prepare(
      'SELECT id, reports_to, tipo_nodo, cf_persona, nome_uo, centro_costo, sede, funzione FROM nodi_organigramma WHERE deleted_at IS NULL ORDER BY id'
    ).all()
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
