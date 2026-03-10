import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const d = db()
    const body = await req.json() as Record<string, unknown>

    if (Array.isArray(body)) {
      // Bulk upsert
      const stmt = d.prepare(`
        INSERT INTO variabili_org_valori (entita_tipo, entita_id, var_id, valore, updated_at)
        VALUES (@entita_tipo, @entita_id, @var_id, @valore, CURRENT_TIMESTAMP)
        ON CONFLICT(entita_tipo, entita_id, var_id) DO UPDATE SET valore = excluded.valore, updated_at = CURRENT_TIMESTAMP
      `)
      const bulk = d.transaction(() => {
        for (const item of body as Record<string, unknown>[]) {
          stmt.run({
            entita_tipo: item.entita_tipo,
            entita_id: item.entita_id,
            var_id: item.var_id,
            valore: item.valore ?? null,
          })
        }
      })
      bulk()
    } else {
      d.prepare(`
        INSERT INTO variabili_org_valori (entita_tipo, entita_id, var_id, valore, updated_at)
        VALUES (@entita_tipo, @entita_id, @var_id, @valore, CURRENT_TIMESTAMP)
        ON CONFLICT(entita_tipo, entita_id, var_id) DO UPDATE SET valore = excluded.valore, updated_at = CURRENT_TIMESTAMP
      `).run({
        entita_tipo: body.entita_tipo,
        entita_id: body.entita_id,
        var_id: body.var_id,
        valore: body.valore ?? null,
      })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
