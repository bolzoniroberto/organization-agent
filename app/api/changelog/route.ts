import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const d = db()
    const url = new URL(req.url)
    const search = url.searchParams.get('search') ?? ''
    const entityType = url.searchParams.get('entityType') ?? ''
    const action = url.searchParams.get('action') ?? ''
    const dateFrom = url.searchParams.get('dateFrom') ?? ''
    const dateTo = url.searchParams.get('dateTo') ?? ''
    const limit = parseInt(url.searchParams.get('limit') ?? '200')
    const offset = parseInt(url.searchParams.get('offset') ?? '0')

    const conditions: string[] = []
    const bindings: unknown[] = []

    if (search) {
      conditions.push('(entity_id LIKE ? OR entity_label LIKE ? OR field_name LIKE ? OR old_value LIKE ? OR new_value LIKE ?)')
      const s = `%${search}%`
      bindings.push(s, s, s, s, s)
    }
    if (entityType) { conditions.push('entity_type = ?'); bindings.push(entityType) }
    if (action) { conditions.push('action = ?'); bindings.push(action) }
    if (dateFrom) { conditions.push('timestamp >= ?'); bindings.push(dateFrom) }
    if (dateTo) { conditions.push('timestamp <= ?'); bindings.push(dateTo + ' 23:59:59') }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = d.prepare(
      `SELECT * FROM change_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    ).all(...bindings, limit, offset)

    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
