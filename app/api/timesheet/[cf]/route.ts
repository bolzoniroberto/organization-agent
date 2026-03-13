import { NextRequest, NextResponse } from 'next/server'
import { db, writeChangeLog } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const row = db().prepare('SELECT * FROM supervisioni_timesheet WHERE cf_dipendente = ?').get(cf)
    if (!row) return NextResponse.json(null, { status: 404 })
    return NextResponse.json(row)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const body = await req.json() as { cf_supervisore: string | null }
    const d = db()
    const existing = d.prepare('SELECT * FROM supervisioni_timesheet WHERE cf_dipendente = ?').get(cf) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    d.prepare('UPDATE supervisioni_timesheet SET cf_supervisore = ? WHERE cf_dipendente = ?').run(body.cf_supervisore, cf)
    writeChangeLog('timesheet', cf, null, 'UPDATE', 'cf_supervisore', String(existing.cf_supervisore ?? ''), String(body.cf_supervisore ?? ''))
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ cf: string }> }) {
  try {
    const { cf } = await params
    const d = db()
    const hard = req.nextUrl.searchParams.get('hard') === 'true'

    const existing = d.prepare('SELECT * FROM supervisioni_timesheet WHERE cf_dipendente = ?').get(cf) as Record<string, unknown> | undefined
    if (!existing) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })

    if (hard) {
      d.prepare('DELETE FROM supervisioni_timesheet WHERE cf_dipendente = ?').run(cf)
      writeChangeLog('timesheet', cf, null, 'DELETE', null, null, 'hard')
    } else {
      writeChangeLog('timesheet', cf, null, 'DELETE', null, null, null)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 })
  }
}
