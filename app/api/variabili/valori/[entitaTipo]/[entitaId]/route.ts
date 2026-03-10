import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entitaTipo: string; entitaId: string }> }
) {
  try {
    const { entitaTipo, entitaId } = await params
    const rows = db().prepare(`
      SELECT v.*, d.nome, d.label, d.tipo
      FROM variabili_org_valori v
      JOIN variabili_org_definizioni d ON d.id = v.var_id
      WHERE v.entita_tipo = ? AND v.entita_id = ?
    `).all(entitaTipo, entitaId)
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
