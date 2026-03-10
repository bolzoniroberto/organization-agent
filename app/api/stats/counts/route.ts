import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const d = db()
    const nodi = (d.prepare('SELECT COUNT(*) as n FROM nodi_organigramma WHERE deleted_at IS NULL').get() as { n: number }).n
    const persone = (d.prepare('SELECT COUNT(*) as n FROM persone WHERE deleted_at IS NULL').get() as { n: number }).n
    const timesheet = (d.prepare('SELECT COUNT(*) as n FROM supervisioni_timesheet').get() as { n: number }).n
    const tns = (d.prepare('SELECT COUNT(*) as n FROM ruoli_tns').get() as { n: number }).n
    const struttureTns = (d.prepare('SELECT COUNT(*) as n FROM strutture_tns').get() as { n: number }).n
    return NextResponse.json({ nodi, persone, timesheet, tns, struttureTns })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
