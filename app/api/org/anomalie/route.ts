import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const d = db()

    const orfani = d.prepare(`
      SELECT n.* FROM nodi_organigramma n
      LEFT JOIN nodi_organigramma p ON p.id = n.reports_to
      WHERE n.reports_to IS NOT NULL AND p.id IS NULL AND n.deleted_at IS NULL
    `).all()

    const strutture_vuote = d.prepare(`
      SELECT n.* FROM nodi_organigramma n
      WHERE n.tipo_nodo = 'STRUTTURA'
        AND n.cf_persona IS NULL
        AND n.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM nodi_organigramma c
          WHERE c.reports_to = n.id AND c.deleted_at IS NULL
        )
    `).all()

    const persone_senza_nodo = d.prepare(`
      SELECT p.* FROM persone p
      WHERE p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM nodi_organigramma n
          WHERE n.cf_persona = p.cf AND n.deleted_at IS NULL
        )
    `).all()

    return NextResponse.json({ orfani, strutture_vuote, persone_senza_nodo })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
