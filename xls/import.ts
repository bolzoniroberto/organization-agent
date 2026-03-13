import * as XLSX from 'xlsx'
import { db, writeChangeLog } from '../lib/db'
import type { ImportReport } from '../types'

type RawRow = Record<string, unknown>
type EntityTarget = 'nodi_org' | 'persone' | 'timesheet' | 'tns' | 'strutture_tns'
type ImportMode = 'SOSTITUTIVA' | 'INTEGRATIVA'

export interface ImportOptions {
  buffer: Buffer
  entity: EntityTarget
  mode: ImportMode
  mapping: Record<string, string>  // fieldName -> columnHeader (or var_<id> -> columnHeader)
  sheetName?: string
  dryRun?: boolean
  keyField?: string  // campo di join alternativo alla chiave primaria naturale
}

export interface DryRunResult {
  toInsert: number
  toUpdate: number
  toSkip: number
  toVarUpdate: number
  anomalie: Array<{ tipo: string; dettaglio: string; riga?: number }>
  diff: Array<{ id: string; field: string; oldVal: string; newVal: string }>
}

function toStr(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  const s = String(val).trim()
  return s === '' ? null : s
}

function readSheet(buffer: Buffer, sheetName?: string): { rows: RawRow[]; sheet: string; sheetNames: string[] } {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sheetNames = wb.SheetNames
  const sheet = sheetName && wb.Sheets[sheetName] ? sheetName : sheetNames[0]
  const ws = wb.Sheets[sheet]
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '', raw: true })
  return { rows, sheet, sheetNames }
}

export function previewXls(buffer: Buffer, sheetName?: string): {
  sheetNames: string[]
  headers: string[]
  sampleRows: RawRow[]
} {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sheetNames = wb.SheetNames
  const sn = sheetName && wb.Sheets[sheetName] ? sheetName : sheetNames[0]
  const ws = wb.Sheets[sn]
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '', raw: true })
  const headers = rows.length > 0 ? Object.keys(rows[0]) : []
  return { sheetNames, headers, sampleRows: rows.slice(0, 5) }
}

function applyMappingToRow(row: RawRow, mapping: Record<string, string>): Record<string, string | null> {
  const result: Record<string, string | null> = {}
  for (const [field, col] of Object.entries(mapping)) {
    if (col && row[col] !== undefined) {
      result[field] = toStr(row[col])
    }
  }
  return result
}

function detectAnomalies(
  rows: RawRow[],
  entity: EntityTarget,
  mapping: Record<string, string>,
  joinKey: string
): Array<{ tipo: string; dettaglio: string; riga?: number }> {
  const anomalies: Array<{ tipo: string; dettaglio: string; riga?: number }> = []

  rows.forEach((row, i) => {
    const mapped = applyMappingToRow(row, mapping)
    const key = mapped[joinKey]
    if (!key) {
      anomalies.push({ tipo: 'CF_MANCANTE', dettaglio: `Riga ${i + 2}: chiave ${joinKey} mancante`, riga: i + 2 })
    }
    if (entity === 'nodi_org' && mapped.fte) {
      const fte = parseFloat(mapped.fte)
      if (isNaN(fte) || fte < 0 || fte > 100) {
        anomalies.push({ tipo: 'FTE_INCOERENTE', dettaglio: `Riga ${i + 2}: FTE=${mapped.fte} fuori range`, riga: i + 2 })
      }
    }
  })
  return anomalies
}

export function importXls(options: ImportOptions): ImportReport | DryRunResult {
  const { buffer, entity, mode, mapping, sheetName, dryRun = false, keyField: customKeyField } = options
  const d = db()

  const { rows } = readSheet(buffer, sheetName)

  // Chiave primaria naturale dell'entità (usata per UPDATE/INSERT nel DB)
  const naturalKey = entity === 'nodi_org' ? 'id' : entity === 'persone' ? 'cf' :
    entity === 'timesheet' ? 'cf_dipendente' : entity === 'strutture_tns' ? 'codice' : 'cf'

  // joinKey: campo del file/DB usato per trovare il record. Può differire dalla PK naturale.
  const joinKey = customKeyField ?? naturalKey
  const isNaturalKey = joinKey === naturalKey

  const anomalie = detectAnomalies(rows, entity, mapping, joinKey)

  const report: ImportReport = { inserted: 0, updated: 0, skipped: 0, varSaved: 0, errors: [], anomalie: anomalie.length }
  const dryResult: DryRunResult = { toInsert: 0, toUpdate: 0, toSkip: 0, toVarUpdate: 0, anomalie, diff: [] }

  // Collect var mappings
  const varMappings: Record<number, string> = {}
  for (const [field, col] of Object.entries(mapping)) {
    if (field.startsWith('var_') && col) {
      const varId = parseInt(field.replace('var_', ''))
      if (!isNaN(varId)) varMappings[varId] = col
    }
  }
  const nativeMappings = Object.fromEntries(
    Object.entries(mapping).filter(([f]) => !f.startsWith('var_'))
  )

  const runImport = d.transaction(() => {
    for (const row of rows) {
      const mapped = applyMappingToRow(row, nativeMappings)
      const joinValue = mapped[joinKey]
      if (!joinValue) continue

      // Lookup per joinKey (può essere diverso dalla PK naturale)
      let existing: Record<string, unknown> | undefined
      if (entity === 'nodi_org') {
        existing = d.prepare(`SELECT * FROM nodi_organigramma WHERE ${joinKey} = ? AND deleted_at IS NULL`).get(joinValue) as Record<string, unknown> | undefined
      } else if (entity === 'persone') {
        existing = d.prepare(`SELECT * FROM persone WHERE ${joinKey} = ? AND deleted_at IS NULL`).get(joinValue) as Record<string, unknown> | undefined
      } else if (entity === 'timesheet') {
        existing = d.prepare(`SELECT * FROM supervisioni_timesheet WHERE ${joinKey} = ?`).get(joinValue) as Record<string, unknown> | undefined
      } else if (entity === 'tns') {
        existing = d.prepare(`SELECT * FROM persone WHERE ${joinKey} = ? AND deleted_at IS NULL`).get(joinValue) as Record<string, unknown> | undefined
      } else if (entity === 'strutture_tns') {
        existing = d.prepare(`SELECT * FROM strutture_tns WHERE ${joinKey} = ?`).get(joinValue) as Record<string, unknown> | undefined
      }

      // La chiave da usare per INSERT/UPDATE nel DB è sempre la PK naturale
      const key = existing ? String(existing[naturalKey]) : (isNaturalKey ? joinValue : null)

      if (dryRun) {
        if (!existing && !isNaturalKey) {
          dryResult.toSkip++
          continue
        }
        if (!existing) dryResult.toInsert++
        else {
          let hasChange = false
          for (const [field, newVal] of Object.entries(mapped)) {
            if (field === joinKey || field === naturalKey) continue
            const oldVal = String(existing[field] ?? '')
            if (mode === 'INTEGRATIVA' && oldVal !== '') continue
            if (oldVal !== String(newVal ?? '')) {
              hasChange = true
              dryResult.diff.push({ id: key ?? joinValue, field, oldVal, newVal: newVal ?? '' })
            }
          }
          if (hasChange) dryResult.toUpdate++
          else dryResult.toSkip++
        }
        // conta anche le variabili che verranno aggiornate
        const dryEntitaTipo = { nodi_org: 'nodo_org', persone: 'persona', timesheet: 'timesheet', tns: 'persona', strutture_tns: 'struttura_tns' }[entity]
        const dryEntitaId = existing ? String(existing[naturalKey]) : (isNaturalKey ? joinValue : null)
        if (dryEntitaId) {
          for (const [varId, col] of Object.entries(varMappings)) {
            const valore = toStr(row[col])
            if (valore === null) continue
            if (!existing && mode === 'INTEGRATIVA') continue
            if (mode === 'INTEGRATIVA') {
              const curr = d.prepare('SELECT valore FROM variabili_org_valori WHERE entita_tipo = ? AND entita_id = ? AND var_id = ?')
                .get(dryEntitaTipo, dryEntitaId, Number(varId)) as { valore: string | null } | undefined
              if (curr?.valore != null) continue
            }
            dryResult.toVarUpdate++
          }
        }
        continue
      }

      if (!key) continue  // joinKey alternativo ma record non trovato → skip

      try {
        if (!existing) {
          // INSERT — solo se stiamo usando la PK naturale come join key
          if (!isNaturalKey) {
            report.skipped++
            report.errors.push(`SKIP riga joinKey=${joinValue}: record non trovato e chiave alternativa non permette INSERT`)
            continue
          }
          let insResult: { changes: number } = { changes: 0 }
          if (entity === 'nodi_org') {
            insResult = d.prepare(`INSERT OR IGNORE INTO nodi_organigramma
              (id, reports_to, tipo_nodo, cf_persona, nome_uo, nome_uo_2, centro_costo, fte,
               job_title, funzione, processo, incarico_sgsl, societa_org, testata_gg, sede, tipo_collab, note_uo)
              VALUES (@id, @reports_to, @tipo_nodo, @cf_persona, @nome_uo, @nome_uo_2, @centro_costo, @fte,
               @job_title, @funzione, @processo, @incarico_sgsl, @societa_org, @testata_gg, @sede, @tipo_collab, @note_uo)`).run({
              id: key, reports_to: mapped.reports_to ?? null, tipo_nodo: mapped.tipo_nodo ?? 'STRUTTURA',
              cf_persona: mapped.cf_persona ?? null, nome_uo: mapped.nome_uo ?? null, nome_uo_2: mapped.nome_uo_2 ?? null,
              centro_costo: mapped.centro_costo ?? null, fte: mapped.fte ? parseFloat(mapped.fte) : null,
              job_title: mapped.job_title ?? null, funzione: mapped.funzione ?? null, processo: mapped.processo ?? null,
              incarico_sgsl: mapped.incarico_sgsl ?? null, societa_org: mapped.societa_org ?? null,
              testata_gg: mapped.testata_gg ?? null, sede: mapped.sede ?? null,
              tipo_collab: mapped.tipo_collab ?? null, note_uo: mapped.note_uo ?? null,
            })
          } else if (entity === 'persone') {
            insResult = d.prepare(`INSERT OR IGNORE INTO persone
              (cf, cognome, nome, data_nascita, sesso, email, matricola, societa, area, sotto_area,
               cdc_amministrativo, sede, data_assunzione, data_fine_rapporto, tipo_contratto,
               qualifica, livello, modalita_presenze, part_time, ral)
              VALUES (@cf, @cognome, @nome, @data_nascita, @sesso, @email, @matricola, @societa, @area, @sotto_area,
               @cdc_amministrativo, @sede, @data_assunzione, @data_fine_rapporto, @tipo_contratto,
               @qualifica, @livello, @modalita_presenze, @part_time, @ral)`).run({
              cf: key, cognome: mapped.cognome ?? null, nome: mapped.nome ?? null,
              data_nascita: mapped.data_nascita ?? null, sesso: mapped.sesso ?? null,
              email: mapped.email ?? null, matricola: mapped.matricola ?? null,
              societa: mapped.societa ?? null, area: mapped.area ?? null, sotto_area: mapped.sotto_area ?? null,
              cdc_amministrativo: mapped.cdc_amministrativo ?? null, sede: mapped.sede ?? null,
              data_assunzione: mapped.data_assunzione ?? null, data_fine_rapporto: mapped.data_fine_rapporto ?? null,
              tipo_contratto: mapped.tipo_contratto ?? null, qualifica: mapped.qualifica ?? null,
              livello: mapped.livello ?? null, modalita_presenze: mapped.modalita_presenze ?? null,
              part_time: mapped.part_time ? parseFloat(mapped.part_time) : null,
              ral: mapped.ral ? parseFloat(mapped.ral) : null,
            })
          } else if (entity === 'timesheet') {
            insResult = d.prepare(`INSERT OR IGNORE INTO supervisioni_timesheet (cf_dipendente, cf_supervisore, data_inizio, data_fine)
              VALUES (@cf_dipendente, @cf_supervisore, @data_inizio, @data_fine)`).run({
              cf_dipendente: key, cf_supervisore: mapped.cf_supervisore ?? null,
              data_inizio: mapped.data_inizio ?? null, data_fine: mapped.data_fine ?? null
            })
          } else if (entity === 'tns') {
            // Per entità 'tns' i dati sono in persone — mai INSERT nuovi record
            report.skipped++
            report.errors.push(`SKIP tns key=${key}: la persona non esiste in persone (mai INSERT da import tns)`)
            continue
          } else if (entity === 'strutture_tns') {
            insResult = d.prepare(`INSERT OR IGNORE INTO strutture_tns
              (codice, nome, padre, livello, tipo, descrizione, attivo, cdc, titolare, cf_titolare, sede_tns,
               viaggiatore, approvatore, cassiere, visualizzatore, segretario, controllore, amministrazione,
               ruoli_oltrv, ruoli, segr_redaz, segreteria_red_asst, segretario_asst, controllore_asst,
               ruoli_afc, ruoli_hr, altri_ruoli, gruppo_sind)
              VALUES (@codice, @nome, @padre, @livello, @tipo, @descrizione, @attivo, @cdc, @titolare, @cf_titolare, @sede_tns,
               @viaggiatore, @approvatore, @cassiere, @visualizzatore, @segretario, @controllore, @amministrazione,
               @ruoli_oltrv, @ruoli, @segr_redaz, @segreteria_red_asst, @segretario_asst, @controllore_asst,
               @ruoli_afc, @ruoli_hr, @altri_ruoli, @gruppo_sind)`).run({
              codice: key, nome: mapped.nome ?? null, padre: mapped.padre ?? null,
              livello: mapped.livello ?? null, tipo: mapped.tipo ?? null,
              descrizione: mapped.descrizione ?? null, attivo: mapped.attivo != null ? parseInt(mapped.attivo) : 1,
              cdc: mapped.cdc ?? null, titolare: mapped.titolare ?? null, cf_titolare: mapped.cf_titolare ?? null,
              sede_tns: mapped.sede_tns ?? null, viaggiatore: mapped.viaggiatore ?? null,
              approvatore: mapped.approvatore ?? null, cassiere: mapped.cassiere ?? null,
              visualizzatore: mapped.visualizzatore ?? null, segretario: mapped.segretario ?? null,
              controllore: mapped.controllore ?? null, amministrazione: mapped.amministrazione ?? null,
              ruoli_oltrv: mapped.ruoli_oltrv ?? null, ruoli: mapped.ruoli ?? null,
              segr_redaz: mapped.segr_redaz ?? null, segreteria_red_asst: mapped.segreteria_red_asst ?? null,
              segretario_asst: mapped.segretario_asst ?? null, controllore_asst: mapped.controllore_asst ?? null,
              ruoli_afc: mapped.ruoli_afc ?? null, ruoli_hr: mapped.ruoli_hr ?? null,
              altri_ruoli: mapped.altri_ruoli ?? null, gruppo_sind: mapped.gruppo_sind ?? null,
            })
          }
          if (insResult.changes > 0) report.inserted++
          else { report.skipped++; report.errors.push(`IGNORED riga key=${key} (duplicato o constraint violato)`) }
        } else {
          // UPDATE — usa sempre la PK naturale come WHERE clause per sicurezza
          const table = entity === 'nodi_org' ? 'nodi_organigramma' : entity === 'persone' ? 'persone' :
            entity === 'timesheet' ? 'supervisioni_timesheet' : entity === 'strutture_tns' ? 'strutture_tns' : 'persone'
          const pkField = naturalKey

          let updated = false
          for (const [field, newVal] of Object.entries(mapped)) {
            if (field === joinKey || field === naturalKey) continue  // non aggiornare la chiave
            const oldVal = existing[field]
            if (mode === 'INTEGRATIVA' && (oldVal !== null && oldVal !== undefined && oldVal !== '')) continue
            if (String(oldVal ?? '') === String(newVal ?? '')) continue
            d.prepare(`UPDATE ${table} SET ${field} = ? WHERE ${pkField} = ?`).run(newVal ?? null, key)
            updated = true
          }
          if (updated) report.updated++
          else report.skipped++
        }

        // Handle var mappings — usa la PK naturale come entita_id
        const ENTITY_TIPO: Record<EntityTarget, string> = {
          nodi_org: 'nodo_org', persone: 'persona', timesheet: 'timesheet',
          tns: 'persona', strutture_tns: 'struttura_tns',
        }
        const entitaTipo = ENTITY_TIPO[entity]
        const entitaId = existing ? String(existing[naturalKey]) : (isNaturalKey ? key : null)
        if (entitaId) {
          for (const [varId, col] of Object.entries(varMappings)) {
            const valore = toStr(row[col])
            if (valore === null) continue  // non salvare valori vuoti/mancanti
            if (!existing && mode === 'INTEGRATIVA') continue
            if (mode === 'INTEGRATIVA') {
              const curr = d.prepare('SELECT valore FROM variabili_org_valori WHERE entita_tipo = ? AND entita_id = ? AND var_id = ?')
                .get(entitaTipo, entitaId, Number(varId)) as { valore: string | null } | undefined
              if (curr?.valore != null) continue
            }
            d.prepare(`INSERT INTO variabili_org_valori (entita_tipo, entita_id, var_id, valore, updated_at)
              VALUES (@entita_tipo, @entita_id, @var_id, @valore, CURRENT_TIMESTAMP)
              ON CONFLICT(entita_tipo, entita_id, var_id) DO UPDATE SET valore = excluded.valore, updated_at = CURRENT_TIMESTAMP`).run({
              entita_tipo: entitaTipo,
              entita_id: entitaId,
              var_id: Number(varId),
              valore
            })
            report.varSaved++
          }
        }
      } catch (e) {
        report.errors.push(String(e))
      }
    }
  })

  if (!dryRun) d.pragma('foreign_keys = OFF')
  runImport()
  if (!dryRun) d.pragma('foreign_keys = ON')

  if (!dryRun) {
    writeChangeLog('system', 'import', null, 'IMPORT', null, null,
      `entity=${entity} mode=${mode} inserted=${report.inserted} updated=${report.updated}`)
    return report
  }

  return dryResult
}
