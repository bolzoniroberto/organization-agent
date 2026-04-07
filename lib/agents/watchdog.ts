import { db } from '@/lib/db'
import crypto from 'crypto'
import type { AgentNotificationSeverity } from '@/types'

interface WatchdogFinding {
  agent_type: string
  severity: AgentNotificationSeverity
  title: string
  body: string
  entity_type?: string
  entity_id?: string
}

// Generates a deterministic ID so the same issue doesn't create duplicates
function findingId(f: WatchdogFinding): string {
  const hash = crypto.createHash('md5')
    .update(`${f.agent_type}::${f.title}::${f.entity_type ?? ''}::${f.entity_id ?? ''}`)
    .digest('hex')
  return `wdg-${hash.slice(0, 16)}`
}

// ────────────────────────────────────────────────────────────────────────────
// RULE: Persone con data_fine_rapporto scaduta ma non marcate come cessate
// ────────────────────────────────────────────────────────────────────────────
function checkExpiredContracts(): WatchdogFinding[] {
  const rows = db().prepare(`
    SELECT cf, cognome, nome, data_fine_rapporto
    FROM persone
    WHERE deleted_at IS NULL
      AND data_fine_rapporto IS NOT NULL
      AND data_fine_rapporto < date('now', '-30 days')
  `).all() as { cf: string; cognome: string; nome: string; data_fine_rapporto: string }[]

  if (rows.length === 0) return []

  return [{
    agent_type: 'watchdog',
    severity: 'critical',
    title: `${rows.length} persone con contratto scaduto da >30 giorni`,
    body: `Le seguenti persone hanno data_fine_rapporto scaduta ma non sono marcate come cessate:\n${rows.slice(0, 10).map(r => `• ${r.cognome} ${r.nome} (${r.cf}) — scaduto il ${r.data_fine_rapporto}`).join('\n')}${rows.length > 10 ? `\n... e altre ${rows.length - 10}` : ''}`,
    entity_type: 'persona',
  }]
}

// ────────────────────────────────────────────────────────────────────────────
// RULE: Nodi PERSONA senza CF associato
// ────────────────────────────────────────────────────────────────────────────
function checkOrphanPersonNodes(): WatchdogFinding[] {
  const rows = db().prepare(`
    SELECT id, nome_uo
    FROM nodi_organigramma
    WHERE deleted_at IS NULL
      AND tipo_nodo = 'PERSONA'
      AND (cf_persona IS NULL OR cf_persona = '')
  `).all() as { id: string; nome_uo: string }[]

  if (rows.length === 0) return []

  return [{
    agent_type: 'watchdog',
    severity: 'warning',
    title: `${rows.length} nodi PERSONA senza codice fiscale`,
    body: `Nodi organigramma di tipo PERSONA che non hanno un CF associato:\n${rows.slice(0, 10).map(r => `• ${r.nome_uo ?? r.id}`).join('\n')}${rows.length > 10 ? `\n... e altri ${rows.length - 10}` : ''}`,
    entity_type: 'nodo',
  }]
}

// ────────────────────────────────────────────────────────────────────────────
// RULE: Strutture puntano a padre inesistente
// ────────────────────────────────────────────────────────────────────────────
function checkBrokenParentLinks(): WatchdogFinding[] {
  const nodiOrfani = db().prepare(`
    SELECT n.id, n.nome_uo, n.reports_to
    FROM nodi_organigramma n
    WHERE n.deleted_at IS NULL
      AND n.reports_to IS NOT NULL
      AND n.reports_to != ''
      AND NOT EXISTS (SELECT 1 FROM nodi_organigramma p WHERE p.id = n.reports_to AND p.deleted_at IS NULL)
  `).all() as { id: string; nome_uo: string; reports_to: string }[]

  const tnsOrfani = db().prepare(`
    SELECT s.codice, s.nome, s.padre
    FROM strutture_tns s
    WHERE s.deleted_at IS NULL
      AND s.padre IS NOT NULL
      AND s.padre != ''
      AND NOT EXISTS (SELECT 1 FROM strutture_tns p WHERE p.codice = s.padre AND p.deleted_at IS NULL)
  `).all() as { codice: string; nome: string; padre: string }[]

  const findings: WatchdogFinding[] = []

  if (nodiOrfani.length > 0) {
    findings.push({
      agent_type: 'watchdog',
      severity: 'warning',
      title: `${nodiOrfani.length} nodi organigramma con padre inesistente`,
      body: nodiOrfani.slice(0, 10).map(r => `• ${r.nome_uo ?? r.id} → reports_to: "${r.reports_to}" (non trovato)`).join('\n'),
      entity_type: 'nodo',
    })
  }

  if (tnsOrfani.length > 0) {
    findings.push({
      agent_type: 'watchdog',
      severity: 'warning',
      title: `${tnsOrfani.length} strutture TNS con padre inesistente`,
      body: tnsOrfani.slice(0, 10).map(r => `• ${r.nome ?? r.codice} → padre: "${r.padre}" (non trovato)`).join('\n'),
      entity_type: 'struttura_tns',
    })
  }

  return findings
}

// ────────────────────────────────────────────────────────────────────────────
// RULE: Span of Control anomalo (>12 riporti diretti)
// ────────────────────────────────────────────────────────────────────────────
function checkSpanOfControl(): WatchdogFinding[] {
  const THRESHOLD = 12
  const rows = db().prepare(`
    SELECT p.id, p.nome_uo, COUNT(c.id) as direct_reports
    FROM nodi_organigramma p
    JOIN nodi_organigramma c ON c.reports_to = p.id AND c.deleted_at IS NULL
    WHERE p.deleted_at IS NULL
      AND p.tipo_nodo = 'STRUTTURA'
    GROUP BY p.id
    HAVING direct_reports > ?
    ORDER BY direct_reports DESC
  `).all(THRESHOLD) as { id: string; nome_uo: string; direct_reports: number }[]

  if (rows.length === 0) return []

  return [{
    agent_type: 'watchdog',
    severity: 'warning',
    title: `${rows.length} UO con span-of-control superiore a ${THRESHOLD}`,
    body: rows.map(r => `• ${r.nome_uo ?? r.id}: ${r.direct_reports} riporti diretti`).join('\n'),
    entity_type: 'nodo',
  }]
}

// ────────────────────────────────────────────────────────────────────────────
// RULE: Persone attive senza nodo organigramma
// ────────────────────────────────────────────────────────────────────────────
function checkPersoneWithoutNode(): WatchdogFinding[] {
  const rows = db().prepare(`
    SELECT p.cf, p.cognome, p.nome
    FROM persone p
    WHERE p.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM nodi_organigramma n
        WHERE n.cf_persona = p.cf AND n.deleted_at IS NULL
      )
  `).all() as { cf: string; cognome: string; nome: string }[]

  if (rows.length === 0) return []

  return [{
    agent_type: 'watchdog',
    severity: 'info',
    title: `${rows.length} persone attive senza nodo organigramma`,
    body: `Queste persone sono in anagrafica ma non hanno un nodo nell'organigramma:\n${rows.slice(0, 10).map(r => `• ${r.cognome} ${r.nome} (${r.cf})`).join('\n')}${rows.length > 10 ? `\n... e altre ${rows.length - 10}` : ''}`,
    entity_type: 'persona',
  }]
}

// ────────────────────────────────────────────────────────────────────────────
// RULE: Campi email mancanti (pattern detection)
// ────────────────────────────────────────────────────────────────────────────
function checkMissingEmails(): WatchdogFinding[] {
  const total = db().prepare(`SELECT COUNT(*) as c FROM persone WHERE deleted_at IS NULL`).get() as { c: number }
  const missing = db().prepare(`SELECT COUNT(*) as c FROM persone WHERE deleted_at IS NULL AND (email IS NULL OR email = '')`).get() as { c: number }

  if (total.c === 0 || missing.c === 0) return []

  const pct = Math.round((missing.c / total.c) * 100)
  if (pct < 5) return [] // Less than 5% missing, not worth alerting

  return [{
    agent_type: 'watchdog',
    severity: pct > 20 ? 'warning' : 'suggestion',
    title: `Email mancante per ${missing.c} persone (${pct}%)`,
    body: `Su ${total.c} persone attive, ${missing.c} non hanno un indirizzo email compilato. Puoi usare l'auto-enrichment per suggerire email basate sul pattern aziendale.`,
    entity_type: 'persona',
  }]
}

// ────────────────────────────────────────────────────────────────────────────
// RULE: Persone duplicate (stesso cognome+nome+data_nascita)
// ────────────────────────────────────────────────────────────────────────────
function checkPotentialDuplicates(): WatchdogFinding[] {
  const rows = db().prepare(`
    SELECT cognome, nome, data_nascita, COUNT(*) as cnt, GROUP_CONCAT(cf, ', ') as cfs
    FROM persone
    WHERE deleted_at IS NULL
      AND cognome IS NOT NULL AND nome IS NOT NULL
    GROUP BY LOWER(cognome), LOWER(nome), data_nascita
    HAVING cnt > 1
    LIMIT 20
  `).all() as { cognome: string; nome: string; data_nascita: string; cnt: number; cfs: string }[]

  if (rows.length === 0) return []

  return [{
    agent_type: 'watchdog',
    severity: 'warning',
    title: `${rows.length} possibili duplicati in anagrafica`,
    body: rows.slice(0, 8).map(r => `• ${r.cognome} ${r.nome}${r.data_nascita ? ` (${r.data_nascita})` : ''}: ${r.cnt} record — CF: ${r.cfs}`).join('\n'),
    entity_type: 'persona',
  }]
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN SCAN — Runs all rules, deduplicates, persists new findings
// ════════════════════════════════════════════════════════════════════════════
export function runWatchdogScan(): { created: number; total: number } {
  const rules = [
    checkExpiredContracts,
    checkOrphanPersonNodes,
    checkBrokenParentLinks,
    checkSpanOfControl,
    checkPersoneWithoutNode,
    checkMissingEmails,
    checkPotentialDuplicates,
  ]

  const allFindings: WatchdogFinding[] = []
  for (const rule of rules) {
    try {
      allFindings.push(...rule())
    } catch (err) {
      console.error('[watchdog] Rule error:', err)
    }
  }

  // Deduplicate: skip findings that already exist with same ID and are not dismissed
  const insertStmt = db().prepare(`
    INSERT OR IGNORE INTO agent_notifications (id, agent_type, severity, title, body, entity_type, entity_id, proposed_actions, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'unread')
  `)

  let created = 0
  const txn = db().transaction(() => {
    for (const f of allFindings) {
      const id = findingId(f)
      // Check if already exists and not dismissed
      const existing = db().prepare(`SELECT status FROM agent_notifications WHERE id = ?`).get(id) as { status: string } | undefined
      if (existing) continue // Already in DB (any status)

      insertStmt.run(id, f.agent_type, f.severity, f.title, f.body, f.entity_type ?? null, f.entity_id ?? null)
      created++
    }
  })
  txn()

  const total = (db().prepare(`SELECT COUNT(*) as c FROM agent_notifications WHERE status IN ('unread', 'read')`).get() as { c: number }).c

  return { created, total }
}
