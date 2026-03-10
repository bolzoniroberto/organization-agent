import { NextRequest, NextResponse } from 'next/server'
import { previewXls } from '@/xls/import'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const sheetName = formData.get('sheetName') as string | undefined

    const result = previewXls(buffer, sheetName ?? undefined)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
