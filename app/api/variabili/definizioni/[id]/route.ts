import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const d = db()
    const body = await req.json() as Record<string, unknown>

    d.prepare(`
      UPDATE variabili_org_definizioni
      SET label = @label, tipo = @tipo, target = @target, opzioni = @opzioni, descrizione = @descrizione, ordine = @ordine
      WHERE id = @id
    `).run({
      id: Number(id),
      label: body.label,
      tipo: body.tipo ?? 'TEXT',
      target: body.target ?? 'nodo',
      opzioni: body.opzioni ?? null,
      descrizione: body.descrizione ?? null,
      ordine: body.ordine ?? 0,
    })

    writeChangeLog('variabile', id, String(body.label), 'UPDATE', null, null, JSON.stringify(body))
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const d = db()

    // Guard: check if values exist
    const count = (d.prepare('SELECT COUNT(*) as n FROM variabili_org_valori WHERE var_id = ?').get(Number(id)) as { n: number }).n
    if (count > 0) {
      return NextResponse.json({ success: false, error: `Impossibile eliminare: ${count} valori associati`, count }, { status: 400 })
    }

    d.prepare('DELETE FROM variabili_org_definizioni WHERE id = ?').run(Number(id))
    writeChangeLog('variabile', id, null, 'DELETE', null, null, null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
