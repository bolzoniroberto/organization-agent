import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function GET() {
  try {
    const rows = db().prepare('SELECT * FROM variabili_org_definizioni ORDER BY ordine, id').all()
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const d = db()
    const body = await req.json() as Record<string, unknown>
    if (!body.nome || !body.label) return NextResponse.json({ success: false, error: 'nome e label obbligatori' }, { status: 400 })

    const result = d.prepare(`
      INSERT INTO variabili_org_definizioni (nome, label, tipo, target, opzioni, descrizione, ordine)
      VALUES (@nome, @label, @tipo, @target, @opzioni, @descrizione, @ordine)
    `).run({
      nome: body.nome,
      label: body.label,
      tipo: body.tipo ?? 'TEXT',
      target: body.target ?? 'nodo',
      opzioni: body.opzioni ?? null,
      descrizione: body.descrizione ?? null,
      ordine: body.ordine ?? 0,
    })

    writeChangeLog('variabile', String(result.lastInsertRowid), String(body.label), 'CREATE', null, null, JSON.stringify(body))
    return NextResponse.json({ success: true, id: result.lastInsertRowid })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
