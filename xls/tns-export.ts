import * as XLSX from 'xlsx'
import { db, writeChangeLog } from '../lib/db'

export interface TnsIssue {
  codice: string
  tipo: 'STRUTTURA' | 'PERSONA'
  label: string
  field: string
  severity: 'error' | 'warning'
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

export function validateTnsOrg(): { errors: TnsIssue[]; warnings: TnsIssue[] } {
  const d = db()
  const errors: TnsIssue[] = []
  const warnings: TnsIssue[] = []

  const cfSet = new Set(
    (d.prepare('SELECT cf FROM persone WHERE deleted_at IS NULL').all() as { cf: string }[]).map(r => r.cf)
  )
  const strutture = (d.prepare(
    'SELECT * FROM strutture_tns WHERE deleted_at IS NULL ORDER BY codice'
  ).all() as Record<string, string | null>[]).filter(s => s.codice != null && !cfSet.has(s.codice))

  for (const s of strutture) {
    const label = s.nome ?? s.codice ?? '?'
    const codice = s.codice ?? ''
    if (isEmpty(s.codice)) {
      errors.push({ codice, tipo: 'STRUTTURA', label, field: 'Codice', severity: 'error' })
    }
    // PADRE required for non-root (padre null = root is OK)
  }

  const persone = d.prepare(
    'SELECT * FROM persone WHERE deleted_at IS NULL AND codice_tns IS NOT NULL ORDER BY cognome, nome'
  ).all() as Record<string, string | null>[]

  const PERSONA_REQUIRED_TNS = [
    { field: 'Codice', key: 'codice_tns' },
    { field: "UNITA' OPERATIVA PADRE", key: 'padre_tns' },
    { field: 'Titolare', key: 'titolare_tns' },
    { field: 'Viaggiatore', key: 'viaggiatore' },
    { field: 'Controllore Ass.to', key: 'controllore_asst' },
    { field: 'Sede_TNS', key: 'sede_tns' },
    { field: 'GruppoSind', key: 'gruppo_sind' },
  ]

  for (const p of persone) {
    const label = [p.cognome, p.nome].filter(Boolean).join(' ') || p.cf || '?'
    const codice = p.cf ?? ''
    for (const { field, key } of PERSONA_REQUIRED_TNS) {
      if (isEmpty(p[key])) {
        errors.push({ codice, tipo: 'PERSONA', label, field, severity: 'error' })
      }
    }
  }

  return { errors, warnings }
}

const HEADERS = [
  "Unità Organizzativa", "CDCCOSTO", "TxCodFiscale", "DESCRIZIONE", "Titolare",
  "LIVELLO", "Codice", "UNITA' OPERATIVA PADRE ", "RUOLI OltreV", "RUOLI",
  "Viaggiatore", "Segr_Redaz", "Approvatore", "Cassiere", "Visualizzatori",
  "Segretario", "Controllore", "Amministrazione", "SegreteriA Red. Ass.ta",
  "SegretariO Ass.to", "Controllore Ass.to", "RuoliAFC", "RuoliHR", "AltriRuoli",
  "Sede_TNS", "GruppoSind",
]

type Row = (string | number | null)[]

function strutRow(s: Record<string, string | null>): Row {
  return [
    '',
    s.cdc ?? '',
    '',
    s.nome ?? '',
    s.titolare ?? '',
    s.livello ?? '',
    s.codice ?? '',
    s.padre ?? '',
    s.ruoli_oltrv ?? '',
    s.ruoli ?? '',
    s.viaggiatore ?? '',
    s.segr_redaz ?? '',
    s.approvatore ?? '',
    s.cassiere ?? '',
    s.visualizzatore ?? '',
    s.segretario ?? '',
    s.controllore ?? '',
    s.amministrazione ?? '',
    s.segreteria_red_asst ?? '',
    s.segretario_asst ?? '',
    s.controllore_asst ?? '',
    s.ruoli_afc ?? '',
    s.ruoli_hr ?? '',
    s.altri_ruoli ?? '',
    s.sede_tns ?? '',
    s.gruppo_sind ?? '',
  ]
}

function personRow(p: Record<string, string | null>): Row {
  const titolare = [p.cognome, p.nome].filter(Boolean).join(' ')
  return [
    p.societa ?? '',
    p.cdc_amministrativo ?? '',
    p.cf ?? '',
    '',
    titolare,
    p.livello_tns ?? '',
    p.cf ?? '',
    p.padre_tns ?? '',
    p.ruoli_oltrv ?? '',
    p.ruoli_tns_desc ?? '',
    p.viaggiatore ?? '',
    p.segr_redaz ?? '',
    p.approvatore ?? '',
    p.cassiere ?? '',
    p.visualizzatore ?? '',
    p.segretario ?? '',
    p.controllore ?? '',
    p.amministrazione ?? '',
    p.segreteria_red_asst ?? '',
    p.segretario_asst ?? '',
    p.controllore_asst ?? '',
    p.ruoli_afc ?? '',
    p.ruoli_hr ?? '',
    p.altri_ruoli ?? '',
    p.sede_tns ?? '',
    p.gruppo_sind ?? '',
  ]
}

export function exportTnsOrgBuffer(): Buffer {
  const d = db()

  const cfSet = new Set(
    (d.prepare('SELECT cf FROM persone WHERE deleted_at IS NULL').all() as { cf: string }[]).map(r => r.cf)
  )
  const strutture = (d.prepare(
    'SELECT * FROM strutture_tns WHERE deleted_at IS NULL ORDER BY codice'
  ).all() as Record<string, string | null>[]).filter(s => s.codice != null && !cfSet.has(s.codice))

  const persone = d.prepare(
    'SELECT * FROM persone WHERE deleted_at IS NULL AND codice_tns IS NOT NULL ORDER BY cognome, nome'
  ).all() as Record<string, string | null>[]

  const struttureRows = strutture.map(strutRow)
  const personeRows = persone.map(personRow)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...struttureRows, ...personeRows]), 'DB_TNS')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...personeRows]), 'TNS Personale')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...struttureRows]), 'TNS Strutture')

  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  writeChangeLog('system', 'export', null, 'EXPORT', null, null, `TNS_ORG_${dateStr}.xlsx`)

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
