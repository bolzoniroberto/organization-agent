import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

const UPDATABLE = ['reports_to','tipo_nodo','cf_persona','nome_uo','nome_uo_2','centro_costo','fte',
  'job_title','funzione','processo','incarico_sgsl','societa_org','testata_gg','sede','tipo_collab','note_uo','extra_data']

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const row = db().prepare('SELECT * FROM nodi_organigramma WHERE id = ?').get(id)
    if (!row) return NextResponse.json(null, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const d = db()
    const body = await req.json() as Record<string, unknown>

    const existing = d.prepare('SELECT * FROM nodi_organigramma WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    for (const [field, newVal] of Object.entries(body)) {
      if (!UPDATABLE.includes(field)) continue
      const oldVal = existing[field]
      if (String(oldVal ?? '') === String(newVal ?? '')) continue
      d.prepare(`UPDATE nodi_organigramma SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(newVal ?? null, id)
      writeChangeLog('nodo_org', id, existing.nome_uo as string ?? null, 'UPDATE', field, String(oldVal ?? ''), String(newVal ?? ''))
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const d = db()
    const existing = d.prepare('SELECT * FROM nodi_organigramma WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    d.prepare('UPDATE nodi_organigramma SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    writeChangeLog('nodo_org', id, existing.nome_uo as string ?? null, 'DELETE', null, null, null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
