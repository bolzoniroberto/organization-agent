import { NextRequest, NextResponse } from 'next/server'
import { importTns } from '@/xls/tns-import'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'file mancante' }, { status: 400 })
    const buffer = Buffer.from(await file.arrayBuffer())
    const report = importTns(buffer)
    return NextResponse.json(report)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
