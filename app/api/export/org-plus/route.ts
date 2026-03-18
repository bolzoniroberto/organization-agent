import { NextRequest, NextResponse } from 'next/server'
import { exportOrgPlusBuffer, validateOrgPlus } from '@/xls/org-plus-export'

export async function GET(req: NextRequest) {
  try {
    const validate = req.nextUrl.searchParams.get('validate') === '1'

    if (validate) {
      const result = validateOrgPlus()
      return NextResponse.json(result)
    }

    const buffer = exportOrgPlusBuffer()
    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Gruppo_Il_Sole_24_ORE_Per_ORG_PLUS_${dateStr}.xlsx"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
