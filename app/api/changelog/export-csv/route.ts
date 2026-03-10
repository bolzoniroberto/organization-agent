import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const d = db()
    const { searchParams } = new URL(req.url)
    const entityType = searchParams.get('entityType')
    const action = searchParams.get('action')
    const search = searchParams.get('search')

    let query = 'SELECT * FROM change_log WHERE 1=1'
    const params: unknown[] = []

    if (entityType) { query += ' AND entity_type = ?'; params.push(entityType) }
    if (action) { query += ' AND action = ?'; params.push(action) }
    if (search) { query += ' AND (entity_id LIKE ? OR field_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }

    query += ' ORDER BY created_at DESC LIMIT 10000'

    const rows = d.prepare(query).all(...params) as Record<string, unknown>[]

    const headers = ['id', 'entity_type', 'entity_id', 'field_name', 'action', 'old_value', 'new_value', 'changed_by', 'created_at']
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => {
        const v = String(r[h] ?? '')
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
      }).join(','))
    ].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="changelog.csv"'
      }
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
