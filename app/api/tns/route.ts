import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const rows = db().prepare('SELECT * FROM persone WHERE deleted_at IS NULL ORDER BY cognome, nome').all()
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
