import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ codice: string }> }) {
  try {
    const { codice } = await params
    const rows = db().prepare('SELECT * FROM persone WHERE codice_tns = ? AND deleted_at IS NULL ORDER BY cognome, nome').all(codice)
    return NextResponse.json(rows)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
