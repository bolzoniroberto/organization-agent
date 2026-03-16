import { NextRequest, NextResponse } from 'next/server'
import { parseSchedaMovimento } from '@/lib/parseSchedaMovimento'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = parseSchedaMovimento(buffer)

    let cfExists = false
    let cfDeleted = false

    if (parsed.cf) {
      const row = db()
        .prepare('SELECT deleted_at FROM persone WHERE cf = ?')
        .get(parsed.cf) as { deleted_at: string | null } | undefined
      if (row) {
        cfExists = true
        cfDeleted = row.deleted_at != null
      }
    }

    return NextResponse.json({ parsed, cfExists, cfDeleted })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
