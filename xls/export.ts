import * as XLSX from 'xlsx'
import { db, writeChangeLog } from '../lib/db'

type Row = Record<string, unknown>

function strOrEmpty(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val)
}

function rowsToSheet(rows: Row[]): XLSX.WorkSheet {
  if (rows.length === 0) return XLSX.utils.aoa_to_sheet([[]])
  return XLSX.utils.json_to_sheet(rows, { skipHeader: false })
}

export function buildExportWorkbook(): XLSX.WorkBook {
  const d = db()

  const nodi = d
    .prepare('SELECT * FROM nodi_organigramma WHERE deleted_at IS NULL ORDER BY id ASC')
    .all() as Row[]

  const persone = d
    .prepare('SELECT * FROM persone WHERE deleted_at IS NULL ORDER BY cf ASC')
    .all() as Row[]

  const timesheetRaw = d
    .prepare('SELECT s.*, p.cognome, p.nome FROM supervisioni_timesheet s LEFT JOIN persone p ON p.cf = s.cf_dipendente ORDER BY s.cf_dipendente ASC')
    .all() as Row[]

  const timesheetRows = timesheetRaw.map(r => ({
    cf_dipendente: strOrEmpty(r.cf_dipendente),
    nome_dipendente: [r.cognome, r.nome].filter(Boolean).join(' ') || '',
    cf_supervisore: strOrEmpty(r.cf_supervisore),
    data_inizio: strOrEmpty(r.data_inizio),
    data_fine: strOrEmpty(r.data_fine),
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, rowsToSheet(nodi), 'Nodi Organigramma')
  XLSX.utils.book_append_sheet(wb, rowsToSheet(persone), 'Persone')
  XLSX.utils.book_append_sheet(wb, rowsToSheet(timesheetRows), 'Timesheet')

  return wb
}

export function exportXlsBuffer(): Buffer {
  const wb = buildExportWorkbook()
  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const filename = `hr-export-${dateStr}.xlsx`

  writeChangeLog('system', 'export', null, 'EXPORT', null, null, filename)

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}
