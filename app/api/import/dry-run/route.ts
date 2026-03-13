import { NextRequest, NextResponse } from 'next/server'
import { importXls } from '@/xls/import'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File mancante' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const entity = formData.get('entity') as string
    const mode = (formData.get('mode') as string) ?? 'SOSTITUTIVA'
    const mapping = JSON.parse((formData.get('mapping') as string) ?? '{}')
    const sheetName = (formData.get('sheetName') as string) ?? undefined
    const keyField = (formData.get('keyField') as string) ?? undefined

    console.log('[dry-run] entity=%s mode=%s keyField=%s mapping=%s', entity, mode, keyField, JSON.stringify(mapping))

    const result = importXls({
      buffer,
      entity: entity as 'nodi_org' | 'persone' | 'timesheet' | 'tns' | 'strutture_tns',
      mode: mode as 'SOSTITUTIVA' | 'INTEGRATIVA',
      mapping,
      sheetName,
      keyField,
      dryRun: true,
    })

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
