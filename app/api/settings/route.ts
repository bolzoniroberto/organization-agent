import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const rows = db().prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[]
  const settings: Record<string, string> = {}
  rows.forEach(r => { settings[r.key] = r.value })
  return NextResponse.json({ settings })
}

export async function PUT(req: Request) {
  const body = await req.json() as { key: string; value: string }
  if (!body.key) return NextResponse.json({ error: 'key obbligatoria' }, { status: 400 })
  db().prepare('INSERT INTO app_settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(body.key, body.value ?? '')
  return NextResponse.json({ success: true })
}
