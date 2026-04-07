import { db } from '@/lib/db'

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean
}

const MAX_ROWS = 50

const ALLOWED_TABLES = [
  'persone', 'nodi_organigramma', 'strutture_tns', 'ruoli_tns',
  'supervisioni_timesheet', 'change_log', 'agent_notifications',
  'variabili_org_definizioni', 'variabili_org_valori',
]

const FORBIDDEN_PATTERNS = [
  /\bDROP\b/i, /\bALTER\b/i, /\bCREATE\b/i, /\bDELETE\b/i,
  /\bINSERT\b/i, /\bUPDATE\b/i, /\bREPLACE\b/i, /\bTRUNCATE\b/i,
  /\bATTACH\b/i, /\bDETACH\b/i, /\bPRAGMA\b/i, /\bVACUUM\b/i,
]

export function validateQuery(sql: string): { valid: boolean; error?: string } {
  const trimmed = sql.trim()

  // Must start with SELECT or WITH
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) {
    return { valid: false, error: 'Solo query SELECT sono ammesse.' }
  }

  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: `Operazione non consentita: ${pattern.source}` }
    }
  }

  return { valid: true }
}

export function executeQuery(sql: string): QueryResult {
  const validation = validateQuery(sql)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // Add LIMIT if not present
  let safeSql = sql.trim()
  if (!/\bLIMIT\b/i.test(safeSql)) {
    safeSql = safeSql.replace(/;?\s*$/, ` LIMIT ${MAX_ROWS + 1}`)
  }

  const stmt = db().prepare(safeSql)
  const rows = stmt.all() as Record<string, unknown>[]

  const truncated = rows.length > MAX_ROWS
  const resultRows = truncated ? rows.slice(0, MAX_ROWS) : rows
  const columns = resultRows.length > 0 ? Object.keys(resultRows[0]) : []

  return {
    columns,
    rows: resultRows,
    rowCount: resultRows.length,
    truncated,
  }
}

export function getSchemaInfo(): string {
  return ALLOWED_TABLES.map(table => {
    try {
      const info = db().prepare(`PRAGMA table_info(${table})`).all() as { name: string; type: string }[]
      const cols = info.map(c => `  ${c.name} (${c.type || 'TEXT'})`).join('\n')
      return `${table}:\n${cols}`
    } catch {
      return `${table}: (non disponibile)`
    }
  }).join('\n\n')
}
