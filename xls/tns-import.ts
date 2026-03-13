import * as XLSX from 'xlsx'
import { db, writeChangeLog } from '../lib/db'
import type { ImportReport } from '../types'

type RawRow = Record<string, unknown>

// Mapping colonne DB_TNS → persone
// Il formato ha CF in una colonna specifica (es. "Codice Fiscale" o simile)
// Le righe con CF di 16 caratteri = persone, altrimenti = strutture
const TNS_COLS: Record<string, string> = {
  'CF': 'cf',
  'Codice Fiscale': 'cf',
  'Codice Struttura': 'codice_tns',
  'Struttura': 'codice_tns',
  'Struttura Padre': 'padre_tns',
  'Livello': 'livello_tns',
  'Titolare': 'titolare_tns',
  'Tipo Approvatore': 'tipo_approvatore',
  'Codice Approvatore': 'codice_approvatore',
  'Viaggiatore': 'viaggiatore',
  'Approvatore': 'approvatore',
  'Cassiere': 'cassiere',
  'Segretario': 'segretario',
  'Controllore': 'controllore',
  'Amministrazione': 'amministrazione',
  'Visualizzatore': 'visualizzatore',
  'Escluso TNS': 'escluso_tns',
  'Sede TNS': 'sede_tns',
  'CdC TNS': 'cdc_tns',
  'Ruoli OLTRV': 'ruoli_oltrv',
  'Ruoli': 'ruoli_tns_desc',
  'Segr Redaz': 'segr_redaz',
  'Segreteria Red Asst': 'segreteria_red_asst',
  'Segretario Asst': 'segretario_asst',
  'Controllore Asst': 'controllore_asst',
  'Ruoli AFC': 'ruoli_afc',
  'Ruoli HR': 'ruoli_hr',
  'Altri Ruoli': 'altri_ruoli',
  'Gruppo Sind': 'gruppo_sind',
}

const STRUTTURA_TNS_COLS: Record<string, string> = {
  'Codice Struttura': 'codice',
  'Struttura': 'codice',
  'Nome': 'nome',
  'Struttura Padre': 'padre',
  'Livello': 'livello',
  'Tipo': 'tipo',
  'Sede TNS': 'sede_tns',
  'CdC': 'cdc',
  'Titolare': 'titolare',
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  const s = String(val).trim()
  return s === '' ? null : s
}

function isPersonaCF(val: string): boolean {
  return /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/i.test(val.trim())
}

export function importTns(buffer: Buffer, sheetName = 'DB_TNS'): ImportReport {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sn = wb.Sheets[sheetName] ? sheetName : wb.SheetNames[0]
  const ws = wb.Sheets[sn]
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '', raw: true })

  let inserted = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []
  const d = db()

  // Detect which header contains the CF / primary key
  const firstRow = rows[0] ?? {}
  const headers = Object.keys(firstRow)

  // Find CF column
  const cfCol = headers.find(h => TNS_COLS[h] === 'cf') ?? headers[0]

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rawCf = toStr(row[cfCol])
    if (!rawCf) { skipped++; continue }

    if (isPersonaCF(rawCf)) {
      // UPDATE persone
      const cf = rawCf.toUpperCase()
      const existing = d.prepare('SELECT * FROM persone WHERE cf = ?').get(cf) as Record<string, unknown> | undefined
      if (!existing) {
        errors.push(`Riga ${i + 2}: CF "${cf}" non trovato in persone — riga saltata`)
        skipped++
        continue
      }
      const updates: Record<string, string | null> = {}
      for (const [header, dbField] of Object.entries(TNS_COLS)) {
        if (dbField === 'cf') continue
        if (!(header in row)) continue
        const val = toStr(row[header])
        updates[dbField] = val
      }
      for (const [field, newVal] of Object.entries(updates)) {
        const oldVal = existing[field] as string | null
        if (String(oldVal ?? '') === String(newVal ?? '')) continue
        d.prepare(`UPDATE persone SET ${field} = ? WHERE cf = ?`).run(newVal, cf)
        writeChangeLog('persona', cf, cf, 'IMPORT', field, String(oldVal ?? ''), String(newVal ?? ''))
      }
      updated++
    } else {
      // INSERT OR REPLACE strutture_tns
      const codice = rawCf
      const fields: Record<string, string | null> = { codice }
      for (const [header, dbField] of Object.entries(STRUTTURA_TNS_COLS)) {
        if (dbField === 'codice') continue
        if (!(header in row)) continue
        fields[dbField] = toStr(row[header])
      }
      const cols = Object.keys(fields)
      const vals = cols.map(c => fields[c])
      const existing = d.prepare('SELECT codice FROM strutture_tns WHERE codice = ?').get(codice)
      if (existing) {
        const setClauses = cols.filter(c => c !== 'codice').map(c => `${c} = ?`).join(', ')
        if (setClauses) {
          d.prepare(`UPDATE strutture_tns SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE codice = ?`)
            .run(...vals.filter((_, i) => cols[i] !== 'codice'), codice)
        }
        updated++
      } else {
        const placeholders = cols.map(() => '?').join(', ')
        d.prepare(`INSERT OR IGNORE INTO strutture_tns (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals)
        writeChangeLog('struttura_tns', codice, fields['nome'] ?? codice, 'IMPORT', null, null, null)
        inserted++
      }
    }
  }

  return { inserted, updated, skipped, varSaved: 0, errors, anomalie: errors.length }
}
