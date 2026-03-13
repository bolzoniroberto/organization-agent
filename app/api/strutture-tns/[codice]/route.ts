import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

const UPDATABLE = [
  'nome','padre','livello','tipo','descrizione','attivo','cdc','titolare','cf_titolare','sede_tns',
  'viaggiatore','approvatore','cassiere','visualizzatore','segretario','controllore','amministrazione',
  'ruoli_oltrv','ruoli','segr_redaz','segreteria_red_asst','segretario_asst','controllore_asst',
  'ruoli_afc','ruoli_hr','altri_ruoli','gruppo_sind',
] as const

export async function GET(_req: NextRequest, { params }: { params: Promise<{ codice: string }> }) {
  try {
    const { codice } = await params
    const d = db()
    const row = d.prepare('SELECT * FROM strutture_tns WHERE codice = ?').get(codice)
    if (!row) return NextResponse.json({ error: 'Non trovato' }, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ codice: string }> }) {
  try {
    const { codice } = await params
    const body = await req.json()
    const d = db()
    const existing = d.prepare('SELECT * FROM strutture_tns WHERE codice = ?').get(codice) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Non trovato' }, { status: 404 })

    for (const field of UPDATABLE) {
      if (!(field in body)) continue
      const oldVal = String(existing[field] ?? '')
      const newVal = String(body[field] ?? '')
      if (oldVal === newVal) continue
      d.prepare(`UPDATE strutture_tns SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE codice = ?`).run(body[field] ?? null, codice)
      writeChangeLog('struttura_tns', codice, String(existing.nome ?? codice), 'UPDATE', field, oldVal || null, newVal || null)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ codice: string }> }) {
  try {
    const { codice } = await params
    const force = req.nextUrl.searchParams.get('force') === 'true'
    const d = db()
    const existing = d.prepare('SELECT nome FROM strutture_tns WHERE codice = ? AND deleted_at IS NULL').get(codice) as { nome: string | null } | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Non trovato' }, { status: 404 })

    if (!force) {
      // Check figli attivi
      const childCount = (d.prepare('SELECT COUNT(*) as c FROM strutture_tns WHERE padre = ? AND deleted_at IS NULL').get(codice) as { c: number }).c
      // Check persone assegnate (padre_tns)
      const personCount = (d.prepare('SELECT COUNT(*) as c FROM persone WHERE padre_tns = ? AND deleted_at IS NULL').get(codice) as { c: number }).c
      // Check subtree totale (conta tutti i discendenti attivi)
      function subtreeCount(id: string): number {
        const kids = (d.prepare('SELECT codice FROM strutture_tns WHERE padre = ? AND deleted_at IS NULL').all(id) as { codice: string }[])
        return kids.reduce((sum, k) => sum + 1 + subtreeCount(k.codice), 0)
      }
      const subtree = subtreeCount(codice)

      if (childCount > 0 || personCount > 0 || subtree > 0) {
        return NextResponse.json({
          success: false,
          blocked: true,
          childCount,
          personCount,
          subtreeCount: subtree,
          error: `La struttura ha ${childCount} figli diretti, ${subtree} discendenti totali e ${personCount} persone assegnate. Usa force=true per eliminare comunque.`
        }, { status: 409 })
      }
    }

    d.prepare('UPDATE strutture_tns SET deleted_at = CURRENT_TIMESTAMP WHERE codice = ?').run(codice)
    writeChangeLog('struttura_tns', codice, existing.nome ?? codice, 'DELETE', null, null, force ? 'forced' : null)
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
