import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

function suggestId(prefix: string, siblings: string[]): string {
  if (siblings.length === 0) return prefix + '01'

  const letterNum = /^([A-Z]+)(\d+)$/
  const matches = siblings.filter(c => letterNum.test(c))
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1].match(letterNum)!
    const pfx = lastMatch[1]
    const maxNum = Math.max(...matches.map(c => parseInt(c.match(letterNum)![2])))
    const nextNum = String(maxNum + 1).padStart(lastMatch[2].length, '0')
    return pfx + nextNum
  }

  if (siblings.every(c => /^[A-Z]$/.test(c))) {
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i)
      if (!siblings.includes(letter)) return letter
    }
  }

  return prefix + '_' + (siblings.length + 1)
}

export async function GET(req: NextRequest) {
  try {
    const prefix = req.nextUrl.searchParams.get('prefix') ?? ''
    const siblings = (
      db().prepare('SELECT id FROM nodi_organigramma WHERE reports_to = ? AND deleted_at IS NULL').all(prefix || null) as { id: string }[]
    ).map(r => r.id)
    return NextResponse.json({ id: suggestId(prefix, siblings) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
