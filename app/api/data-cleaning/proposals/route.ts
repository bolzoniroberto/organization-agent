import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { CleaningProposal } from '@/types'
import crypto from 'crypto'

function hash(...parts: string[]): string {
  return crypto.createHash('md5').update(parts.join('|')).digest('hex').slice(0, 12)
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

export async function GET() {
  try {
    const d = db()
    const proposals: CleaningProposal[] = []

    // CF_DUPLICATO_PERSONE: stesso CF in più righe persone
    const cfDupPersone = d.prepare(`
      SELECT cf, COUNT(*) as cnt FROM persone WHERE deleted_at IS NULL GROUP BY cf HAVING cnt > 1
    `).all() as { cf: string; cnt: number }[]
    for (const row of cfDupPersone) {
      const records = d.prepare(`SELECT * FROM persone WHERE cf = ? AND deleted_at IS NULL`).all(row.cf) as Record<string, unknown>[]
      proposals.push({
        id: hash('CF_DUPLICATO_PERSONE', row.cf),
        tipo: 'CF_DUPLICATO_PERSONE',
        label: `CF duplicato in persone: ${row.cf} (${row.cnt} righe)`,
        severity: 'high',
        entityType: 'persona',
        records,
        suggestedAction: 'merge',
      })
    }

    // PERSONA_SENZA_NODO: persona non riferita da nessun nodo
    const personeSenzaNodo = d.prepare(`
      SELECT p.* FROM persone p
      WHERE p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM nodi_organigramma n
          WHERE n.cf_persona = p.cf AND n.deleted_at IS NULL
        )
    `).all() as Record<string, unknown>[]
    for (const r of personeSenzaNodo) {
      proposals.push({
        id: hash('PERSONA_SENZA_NODO', String(r.cf)),
        tipo: 'PERSONA_SENZA_NODO',
        label: `Persona senza nodo: ${r.cognome ?? ''} ${r.nome ?? ''} (${r.cf})`.trim(),
        severity: 'low',
        entityType: 'persona',
        records: [r],
        suggestedAction: 'review',
      })
    }

    // NODO_PERSONA_SENZA_CF: nodo tipo PERSONA senza cf_persona
    const nodiSenzaCf = d.prepare(`
      SELECT * FROM nodi_organigramma WHERE tipo_nodo = 'PERSONA' AND (cf_persona IS NULL OR cf_persona = '') AND deleted_at IS NULL
    `).all() as Record<string, unknown>[]
    for (const r of nodiSenzaCf) {
      proposals.push({
        id: hash('NODO_PERSONA_SENZA_CF', String(r.id)),
        tipo: 'NODO_PERSONA_SENZA_CF',
        label: `Nodo PERSONA senza CF: ${r.nome_uo ?? r.id}`,
        severity: 'medium',
        entityType: 'nodo',
        records: [r],
        suggestedAction: 'update',
      })
    }

    // TIMESHEET_ORFANO: cf_dipendente non presente in persone
    const tsOrfani = d.prepare(`
      SELECT t.* FROM supervisioni_timesheet t
      WHERE NOT EXISTS (SELECT 1 FROM persone p WHERE p.cf = t.cf_dipendente AND p.deleted_at IS NULL)
    `).all() as Record<string, unknown>[]
    for (const r of tsOrfani) {
      proposals.push({
        id: hash('TIMESHEET_ORFANO', String(r.cf_dipendente)),
        tipo: 'TIMESHEET_ORFANO',
        label: `Timesheet orfano: CF ${r.cf_dipendente} non in persone`,
        severity: 'medium',
        entityType: 'timesheet',
        records: [r],
        suggestedAction: 'delete',
      })
    }

    // STRUTTURA_TNS_ORFANA: nodo TNS con padre non esistente
    const struttOrfane = d.prepare(`
      SELECT s.* FROM strutture_tns s
      WHERE s.padre IS NOT NULL AND s.padre != ''
        AND NOT EXISTS (SELECT 1 FROM strutture_tns p WHERE p.codice = s.padre)
    `).all() as Record<string, unknown>[]
    for (const r of struttOrfane) {
      proposals.push({
        id: hash('STRUTTURA_TNS_ORFANA', String(r.codice)),
        tipo: 'STRUTTURA_TNS_ORFANA',
        label: `Struttura TNS orfana: ${r.codice} (padre ${r.padre} non esiste)`,
        severity: 'medium',
        entityType: 'struttura_tns',
        records: [r],
        suggestedAction: 'review',
      })
    }

    // PERSONA_TNS_ORFANA: ha codice_tns ma padre_tns null → non è assegnata a nessuna struttura
    const personeOrfaneTns = d.prepare(`
      SELECT * FROM persone
      WHERE deleted_at IS NULL
        AND codice_tns IS NOT NULL AND codice_tns != ''
        AND (padre_tns IS NULL OR padre_tns = '')
    `).all() as Record<string, unknown>[]
    for (const r of personeOrfaneTns) {
      proposals.push({
        id: hash('PERSONA_TNS_ORFANA', String(r.cf)),
        tipo: 'PERSONA_TNS_ORFANA',
        label: `Persona TNS orfana: ${r.cognome ?? ''} ${r.nome ?? ''} (${r.cf}) — nessuna struttura assegnata`,
        severity: 'medium',
        entityType: 'persona',
        records: [r],
        suggestedAction: 'update',
      })
    }

    // PERSONA_TNS_STRUTTURA_INVALIDA: padre_tns valorizzato ma struttura non esiste o è eliminata
    const personeStrutturaInvalida = d.prepare(`
      SELECT p.* FROM persone p
      WHERE p.deleted_at IS NULL
        AND p.padre_tns IS NOT NULL AND p.padre_tns != ''
        AND NOT EXISTS (
          SELECT 1 FROM strutture_tns s WHERE s.codice = p.padre_tns AND s.deleted_at IS NULL
        )
    `).all() as Record<string, unknown>[]
    for (const r of personeStrutturaInvalida) {
      proposals.push({
        id: hash('PERSONA_TNS_STRUTTURA_INVALIDA', String(r.cf)),
        tipo: 'PERSONA_TNS_STRUTTURA_INVALIDA',
        label: `Persona TNS con struttura invalida: ${r.cognome ?? ''} ${r.nome ?? ''} (${r.cf}) → padre_tns "${r.padre_tns}" non esiste`,
        severity: 'high',
        entityType: 'persona',
        records: [r],
        suggestedAction: 'update',
      })
    }

    // NOME_SIMILE: cognome+nome quasi identici tra persone diverse (Levenshtein ≤ 2)
    const tuttePersone = d.prepare(`SELECT cf, cognome, nome FROM persone WHERE deleted_at IS NULL`).all() as { cf: string; cognome: string | null; nome: string | null }[]
    const seen = new Set<string>()
    for (let i = 0; i < tuttePersone.length; i++) {
      for (let j = i + 1; j < tuttePersone.length; j++) {
        const a = tuttePersone[i], b = tuttePersone[j]
        const nameA = `${a.cognome ?? ''} ${a.nome ?? ''}`.trim().toLowerCase()
        const nameB = `${b.cognome ?? ''} ${b.nome ?? ''}`.trim().toLowerCase()
        if (!nameA || !nameB) continue
        const dist = levenshtein(nameA, nameB)
        if (dist > 0 && dist <= 2) {
          const key = [a.cf, b.cf].sort().join('|')
          if (seen.has(key)) continue
          seen.add(key)
          const rA = d.prepare(`SELECT * FROM persone WHERE cf = ?`).get(a.cf) as Record<string, unknown>
          const rB = d.prepare(`SELECT * FROM persone WHERE cf = ?`).get(b.cf) as Record<string, unknown>
          proposals.push({
            id: hash('NOME_SIMILE', key),
            tipo: 'NOME_SIMILE',
            label: `Nomi simili (dist=${dist}): "${nameA}" vs "${nameB}"`,
            severity: 'low',
            entityType: 'persona',
            records: [rA, rB],
            suggestedAction: 'merge',
          })
        }
      }
    }

    return NextResponse.json(proposals)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
