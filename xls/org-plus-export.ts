import * as XLSX from 'xlsx'
import { db, writeChangeLog } from '../lib/db'

const HEADERS = [
  "SocietàOrg","Unità Organizzativa","Unità Organizzativa 2","Testata GG","Testata 2",
  "IncaricoSGSL","CdC","CdC2","ALTRI INCARICHI","Titolare","DettaglioTitolare","Titolare 2",
  "Cognome 2","Note Txt","Note Txt 2","Note su Unità","Sede","Sede 2","Tipo Collaborazione",
  "Maternità","Processo","Format","Funzione","AllegatiDip","Art GG","Tipo GG","Fte","ID",
  "ReportsTo","Foto","Variazioni Posizione","TxCodFiscale","Cognome","Nome","Società","Area",
  "SottoArea","CdcAmministrazione","Descrizione Cdc","Data-ass","Data fine rapporto","Sesso",
  "Contratto","Qualifica","Livello","Testata giornalistica","Indirizzo","CAP","Città",
  "Timb-fir","Turno","RAL","Data Nascita","ETA'","Job-title","Liv-studio","Assenza",
  "Responsabilediretto","TD-Sost","Part-time","email","Numero","Cognome_email","Nome_email",
  "email","INFO email","Dipendente email","TOP?verificarli","Scelti","Scelti2 Tutti",
  "Escluso da TNS","Popolaz_TNS","Deltacdc_TNS","CDC_TNS","CDC_NEW_TNS","Tipo Approvatore TNS",
  "Note Appr NTS","Titolare_TNS","LIVELLO_TNS","COD_TNS","PADRE_TNS","RUOLI_OltreV_TNS",
  "RUOLI","Viaggiatore_TNS","Segr_Redaz_TNS","Approvatore_TNS","Cassiere_TNS",
  "Visualizzatori_TNS","Segretario_TNS","Controllore_TNS","Amministrazione_TNS",
  "SegreteriA_Red_Assta_TNS","SegretariO_Assto_TNS","Controllore_Assto_TNS","RuoliAFC",
  "RuoliHR","AltriRuoli","Sede_TNS","GruppoSind","Controllo","RespAreaCODFIS","RespAreaCOGN",
  "RespAreaNOM","RespSottoareaCODFIS","RespSottoareaCOGN","RespSottoareaNOM","SBCAP",
  "Escluso SF","Popolazione SF","Cogn","Nome","TxCodFisc","Richiedente SF","Ricevente_Cognome",
  "Ricevente_Nome","Ricevente_CodFis","Note","NO_ORG1e2liv","New posizione dopo","Free",
  "Titolare_SGSL","Ruolo_SGSL","SGSL_SI",
]

type NR = Record<string, unknown>
const e = (v: unknown) => (v !== null && v !== undefined) ? v : ''

function buildRow(r: NR): (string | number | null)[] {
  const isP = r.tipo_nodo === 'PERSONA'
  const titolare = isP ? [r.cognome, r.nome].filter(Boolean).join(' ') : ''
  return [
    e(r.societa_org),           // SocietàOrg
    e(r.nome_uo),               // Unità Organizzativa
    e(r.nome_uo_2),             // Unità Organizzativa 2
    e(r.testata_gg),            // Testata GG
    '',                          // Testata 2
    e(r.incarico_sgsl),         // IncaricoSGSL
    e(r.centro_costo),          // CdC
    '',                          // CdC2
    '',                          // ALTRI INCARICHI
    titolare,                    // Titolare
    '',                          // DettaglioTitolare
    titolare,                    // Titolare 2
    isP ? e(r.cognome) : '',    // Cognome 2
    '',                          // Note Txt
    '',                          // Note Txt 2
    e(r.note_uo),               // Note su Unità
    e(r.n_sede),                // Sede
    '',                          // Sede 2
    e(r.tipo_collab),           // Tipo Collaborazione
    '',                          // Maternità
    e(r.processo),              // Processo
    '',                          // Format
    e(r.funzione),              // Funzione
    '',                          // AllegatiDip
    '',                          // Art GG
    '',                          // Tipo GG
    e(r.fte),                   // Fte
    e(r.id),                    // ID
    e(r.reports_to),            // ReportsTo
    '',                          // Foto
    '',                          // Variazioni Posizione
    isP ? e(r.p_cf) : '',       // TxCodFiscale
    isP ? e(r.cognome) : '',    // Cognome
    isP ? e(r.nome) : '',       // Nome
    isP ? e(r.societa) : '',    // Società
    isP ? e(r.area) : '',       // Area
    isP ? e(r.sotto_area) : '', // SottoArea
    isP ? e(r.cdc_amministrativo) : '', // CdcAmministrazione
    '',                          // Descrizione Cdc
    isP ? e(r.data_assunzione) : '', // Data-ass
    isP ? e(r.data_fine_rapporto) : '', // Data fine rapporto
    isP ? e(r.sesso) : '',      // Sesso
    isP ? e(r.tipo_contratto) : '', // Contratto
    isP ? e(r.qualifica) : '',  // Qualifica
    isP ? e(r.livello) : '',    // Livello
    '',                          // Testata giornalistica
    '',                          // Indirizzo
    '',                          // CAP
    '',                          // Città
    '',                          // Timb-fir
    '',                          // Turno
    isP ? e(r.ral) : '',        // RAL
    isP ? e(r.data_nascita) : '', // Data Nascita
    '',                          // ETA'
    e(r.job_title),             // Job-title
    '',                          // Liv-studio
    '',                          // Assenza
    '',                          // Responsabilediretto
    '',                          // TD-Sost
    isP ? e(r.part_time) : '',  // Part-time
    isP ? e(r.email) : '',      // email
    '',                          // Numero
    isP ? e(r.cognome) : '',    // Cognome_email
    isP ? e(r.nome) : '',       // Nome_email
    '',                          // email (dup)
    '',                          // INFO email
    '',                          // Dipendente email
    '',                          // TOP?verificarli
    '',                          // Scelti
    '',                          // Scelti2 Tutti
    '',                          // Escluso da TNS
    '',                          // Popolaz_TNS
    '',                          // Deltacdc_TNS
    '',                          // CDC_TNS
    '',                          // CDC_NEW_TNS
    '',                          // Tipo Approvatore TNS
    '',                          // Note Appr NTS
    isP ? e(r.titolare_tns) : '', // Titolare_TNS
    isP ? e(r.livello_tns) : '', // LIVELLO_TNS
    isP ? e(r.codice_tns) : '', // COD_TNS
    isP ? e(r.padre_tns) : '',  // PADRE_TNS
    isP ? e(r.ruoli_oltrv) : '', // RUOLI_OltreV_TNS
    '',                          // RUOLI
    isP ? e(r.viaggiatore) : '', // Viaggiatore_TNS
    isP ? e(r.segr_redaz) : '', // Segr_Redaz_TNS
    isP ? e(r.approvatore) : '', // Approvatore_TNS
    isP ? e(r.cassiere) : '',   // Cassiere_TNS
    isP ? e(r.visualizzatore) : '', // Visualizzatori_TNS
    isP ? e(r.segretario) : '', // Segretario_TNS
    isP ? e(r.controllore) : '', // Controllore_TNS
    isP ? e(r.amministrazione) : '', // Amministrazione_TNS
    isP ? e(r.segreteria_red_asst) : '', // SegreteriA_Red_Assta_TNS
    isP ? e(r.segretario_asst) : '', // SegretariO_Assto_TNS
    isP ? e(r.controllore_asst) : '', // Controllore_Assto_TNS
    isP ? e(r.ruoli_afc) : '',  // RuoliAFC
    isP ? e(r.ruoli_hr) : '',   // RuoliHR
    isP ? e(r.altri_ruoli) : '', // AltriRuoli
    isP ? e(r.sede_tns) : '',   // Sede_TNS
    isP ? e(r.gruppo_sind) : '', // GruppoSind
    '',                          // Controllo
    '',                          // RespAreaCODFIS
    '',                          // RespAreaCOGN
    '',                          // RespAreaNOM
    '',                          // RespSottoareaCODFIS
    '',                          // RespSottoareaCOGN
    '',                          // RespSottoareaNOM
    '',                          // SBCAP
    '',                          // Escluso SF
    '',                          // Popolazione SF
    isP ? e(r.cognome) : '',    // Cogn
    isP ? e(r.nome) : '',       // Nome (dup)
    isP ? e(r.p_cf) : '',       // TxCodFisc (dup)
    '',                          // Richiedente SF
    '',                          // Ricevente_Cognome
    '',                          // Ricevente_Nome
    '',                          // Ricevente_CodFis
    '',                          // Note
    '',                          // NO_ORG1e2liv
    e(r.nome_uo),               // New posizione dopo
    '',                          // Free
    titolare,                    // Titolare_SGSL
    '',                          // Ruolo_SGSL
    '',                          // SGSL_SI
  ] as (string | number | null)[]
}

export interface OrgPlusIssue {
  nodoId: string
  tipo: string
  label: string
  field: string
  severity: 'error' | 'warning'
}

const PERSONA_REQUIRED = [
  { field: 'SocietàOrg', key: 'societa_org' },
  { field: 'Unità Organizzativa', key: 'nome_uo' },
  { field: 'Sede', key: 'n_sede' },
  { field: 'Fte', key: 'fte' },
  { field: 'TxCodFiscale', key: 'p_cf' },
  { field: 'Cognome', key: 'cognome' },
  { field: 'Nome', key: 'nome' },
  { field: 'Società', key: 'societa' },
  { field: 'Area', key: 'area' },
  { field: 'SottoArea', key: 'sotto_area' },
  { field: 'CdcAmministrazione', key: 'cdc_amministrativo' },
  { field: 'Contratto', key: 'tipo_contratto' },
  { field: 'Qualifica', key: 'qualifica' },
  { field: 'Livello', key: 'livello' },
  { field: 'Data-ass', key: 'data_assunzione' },
  { field: 'Sesso', key: 'sesso' },
  { field: 'email', key: 'email' },
]

const PERSONA_WARNINGS = [
  { field: 'RAL', key: 'ral' },
  { field: 'Job-title', key: 'job_title' },
]

const STRUTTURA_REQUIRED = [
  { field: 'SocietàOrg', key: 'societa_org' },
  { field: 'Unità Organizzativa', key: 'nome_uo' },
  { field: 'ID', key: 'id' },
]

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

function queryRows(d: ReturnType<typeof db>) {
  return d.prepare(`
    SELECT
      n.id, n.reports_to, n.tipo_nodo, n.cf_persona,
      n.societa_org, n.nome_uo, n.nome_uo_2, n.testata_gg,
      n.incarico_sgsl, n.centro_costo, n.note_uo,
      n.sede AS n_sede, n.tipo_collab, n.processo,
      n.funzione, n.fte, n.job_title,
      p.cf AS p_cf, p.cognome, p.nome, p.sesso, p.email,
      p.societa, p.area, p.sotto_area, p.cdc_amministrativo,
      p.data_assunzione, p.data_fine_rapporto, p.tipo_contratto,
      p.qualifica, p.livello, p.ral, p.data_nascita, p.part_time,
      p.codice_tns, p.padre_tns, p.livello_tns, p.titolare_tns,
      p.viaggiatore, p.approvatore, p.cassiere, p.segretario,
      p.controllore, p.amministrazione, p.visualizzatore,
      p.ruoli_oltrv, p.ruoli_tns_desc, p.segr_redaz,
      p.segreteria_red_asst, p.segretario_asst, p.controllore_asst,
      p.ruoli_afc, p.ruoli_hr, p.altri_ruoli, p.sede_tns, p.gruppo_sind
    FROM nodi_organigramma n
    LEFT JOIN persone p ON p.cf = n.cf_persona AND p.deleted_at IS NULL
    WHERE n.deleted_at IS NULL
    ORDER BY n.id
  `).all() as NR[]
}

export function validateOrgPlus(): { errors: OrgPlusIssue[]; warnings: OrgPlusIssue[] } {
  const d = db()
  const rows = queryRows(d)
  const errors: OrgPlusIssue[] = []
  const warnings: OrgPlusIssue[] = []

  for (const r of rows) {
    const label = r.tipo_nodo === 'PERSONA'
      ? `${r.cognome ?? ''} ${r.nome ?? ''}`.trim() || String(r.id)
      : String(r.nome_uo ?? r.id)

    if (r.tipo_nodo === 'PERSONA') {
      if (!r.p_cf) {
        errors.push({ nodoId: String(r.id), tipo: 'PERSONA', label, field: 'TxCodFiscale', severity: 'error' })
      }
      for (const { field, key } of PERSONA_REQUIRED) {
        if (isEmpty(r[key])) {
          errors.push({ nodoId: String(r.id), tipo: 'PERSONA', label, field, severity: 'error' })
        }
      }
      for (const { field, key } of PERSONA_WARNINGS) {
        if (isEmpty(r[key])) {
          warnings.push({ nodoId: String(r.id), tipo: 'PERSONA', label, field, severity: 'warning' })
        }
      }
      // reports_to required unless root (no parent at all means root)
      if (isEmpty(r.reports_to)) {
        warnings.push({ nodoId: String(r.id), tipo: 'PERSONA', label, field: 'ReportsTo', severity: 'warning' })
      }
    } else if (r.tipo_nodo === 'STRUTTURA') {
      for (const { field, key } of STRUTTURA_REQUIRED) {
        if (isEmpty(r[key])) {
          errors.push({ nodoId: String(r.id), tipo: 'STRUTTURA', label, field, severity: 'error' })
        }
      }
    }
  }

  return { errors, warnings }
}

export function exportOrgPlusBuffer(): Buffer {
  const d = db()
  const rows = queryRows(d)
  const dataRows = rows.map(buildRow)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADERS, ...dataRows]), 'DB_ORGPLUS')

  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  writeChangeLog('system', 'export', null, 'EXPORT', null, null, `org-plus-${dateStr}.xlsx`)

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}
