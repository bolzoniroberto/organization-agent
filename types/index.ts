export interface NodoOrganigramma {
  id: string
  reports_to: string | null
  tipo_nodo: 'STRUTTURA' | 'PERSONA' | 'ANOMALIA'
  cf_persona: string | null
  nome_uo: string | null
  nome_uo_2: string | null
  centro_costo: string | null
  fte: number | null
  job_title: string | null
  funzione: string | null
  processo: string | null
  incarico_sgsl: string | null
  societa_org: string | null
  testata_gg: string | null
  sede: string | null
  tipo_collab: string | null
  note_uo: string | null
  extra_data: string | null
  deleted_at: string | null
  created_at?: string
  updated_at?: string
  // campi virtuali da JOIN persone
  cognome_persona?: string | null
  nome_persona?: string | null
}

export interface Persona {
  cf: string
  cognome: string | null
  nome: string | null
  data_nascita: string | null
  sesso: string | null
  email: string | null
  societa: string | null
  area: string | null
  sotto_area: string | null
  cdc_amministrativo: string | null
  sede: string | null
  data_assunzione: string | null
  data_fine_rapporto: string | null
  tipo_contratto: string | null
  qualifica: string | null
  livello: string | null
  modalita_presenze: string | null
  part_time: number | null
  ral: number | null
  matricola: string | null
  extra_data: string | null
  deleted_at: string | null
  ultimo_aggiornamento?: string
  // === Campi TNS (null se persona non ha dati TNS) ===
  codice_tns: string | null
  padre_tns: string | null
  livello_tns: string | null
  titolare_tns: string | null
  tipo_approvatore: string | null
  codice_approvatore: string | null
  viaggiatore: string | null
  approvatore: string | null
  cassiere: string | null
  segretario: string | null
  controllore: string | null
  amministrazione: string | null
  visualizzatore: string | null
  escluso_tns: number | null
  sede_tns: string | null
  cdc_tns: string | null
  ruoli_oltrv: string | null
  ruoli_tns_desc: string | null
  segr_redaz: string | null
  segreteria_red_asst: string | null
  segretario_asst: string | null
  controllore_asst: string | null
  ruoli_afc: string | null
  ruoli_hr: string | null
  altri_ruoli: string | null
  gruppo_sind: string | null
  // === Campi Payroll ===
  data_assunzione_gruppo: string | null
  codice_posizione: string | null
  desc_posizione: string | null
  tipo_contratto_termine: string | null
  data_scadenza_ct: string | null
  codice_parttime: string | null
  data_decorrenza_parttime: string | null
  data_scadenza_parttime: string | null
  categoria_protetta: string | null
  azienda_provenienza: string | null
  area_livello3: string | null
  tipo_orario: string | null
  sw_tipologia: string | null
  sw_scadenza: string | null
  cittadinanza: string | null
  desc_contratto: string | null
  codice_sede: string | null
}

export interface SupervisioneTimesheet {
  cf_dipendente: string
  cf_supervisore: string | null
  data_inizio: string | null
  data_fine: string | null
}

// RuoloTns: alias retrocompatibile — i dati ora vivono in persone
export interface RuoloTns extends Pick<Persona,
  'codice_tns' | 'padre_tns' | 'livello_tns' | 'titolare_tns' |
  'tipo_approvatore' | 'codice_approvatore' | 'viaggiatore' | 'approvatore' |
  'cassiere' | 'segretario' | 'controllore' | 'amministrazione' |
  'visualizzatore' | 'escluso_tns' | 'sede_tns' | 'cdc_tns' |
  'ruoli_oltrv' | 'ruoli_tns_desc' | 'segr_redaz' | 'segreteria_red_asst' |
  'segretario_asst' | 'controllore_asst' | 'ruoli_afc' | 'ruoli_hr' |
  'altri_ruoli' | 'gruppo_sind'
> {
  cf_persona: string
}

export interface ImportAnomalia {
  id: number
  import_ts: string
  file_source: string | null
  riga: number | null
  tipo: string
  dettaglio: string | null
}

export interface ChangeLogEntry {
  id: number
  timestamp: string
  entity_type: string
  entity_id: string
  entity_label: string | null
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'IMPORT' | 'EXPORT' | 'AGENT_SUGGEST'
  field_name: string | null
  old_value: string | null
  new_value: string | null
}

export interface ImportReport {
  inserted: number
  updated: number
  skipped: number
  varSaved: number
  errors: string[]
  anomalie: number
}

export type VarTarget = 'nodo' | 'persona' | 'timesheet' | 'tns' | 'struttura_tns' | 'tutti'

export interface VariabileOrgDefinizione {
  id: number
  nome: string
  label: string
  tipo: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'SELECT'
  target: VarTarget
  opzioni: string | null
  descrizione: string | null
  ordine: number
}

export interface VariabileOrgValore {
  id: number
  entita_tipo: string
  entita_id: string
  var_id: number
  valore: string | null
  updated_at: string | null
}

export interface StrutturaTns {
  codice: string
  nome: string | null
  padre: string | null
  livello: string | null
  tipo: string | null
  descrizione: string | null
  attivo: number | null
  cdc: string | null
  titolare: string | null
  cf_titolare: string | null
  sede_tns: string | null
  viaggiatore: string | null
  approvatore: string | null
  cassiere: string | null
  visualizzatore: string | null
  segretario: string | null
  controllore: string | null
  amministrazione: string | null
  ruoli_oltrv: string | null
  ruoli: string | null
  segr_redaz: string | null
  segreteria_red_asst: string | null
  segretario_asst: string | null
  controllore_asst: string | null
  ruoli_afc: string | null
  ruoli_hr: string | null
  altri_ruoli: string | null
  gruppo_sind: string | null
  extra_data: string | null
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
  person_count?: number
}

export type ActiveSection = 'organigramma' | 'masterdata' | 'import' | 'storico' | 'data-cleaning' | 'db-live' | 'agenti' | 'accordion' | 'dashboard' | 'esportazioni' | 'impostazioni'
export type ActiveView = 'posizioni' | 'persone-ts' | 'tns' | 'nodi' | 'persone' | 'ruoli-tns' | 'strutture-tns' | 'variabili' | 'bulk' | 'enrich' | 'scheda-movimento' | 'verifica-dipendenti' | 'dc-duplicati' | 'dc-bulk-edit' | 'dc-merge' | 'ordine-servizio' | 'accordion-uo' | 'accordion-tns' | 'accordion-responsabili'

export type ProposalTipo =
  | 'INSERT_PERSONA'
  | 'UPDATE_PERSONA'
  | 'DELETE_PERSONA'
  | 'INSERT_NODO'
  | 'UPDATE_NODO'
  | 'REPARENT_NODO'
  | 'UPDATE_RUOLO_TNS'
  | 'INSERT_STRUTTURA_TNS'
  | 'UPDATE_STRUTTURA_TNS'

export interface OrdineServizioProposal {
  id: string
  tipo: ProposalTipo
  label: string
  rationale: string
  confidence: 'high' | 'medium' | 'low'
  entityType: 'persona' | 'nodo' | 'ruolo_tns' | 'struttura_tns'
  entityId?: string
  entityLabel?: string
  data: Record<string, unknown>
  currentValues?: Record<string, unknown>
}

export interface OrdineServizioAnalysis {
  sommario: string
  proposte: OrdineServizioProposal[]
  avvertenze: string[]
}

export interface CleaningProposal {
  id: string
  tipo: string
  label: string
  severity: 'high' | 'medium' | 'low'
  entityType: string
  records: Record<string, unknown>[]
  suggestedAction: 'merge' | 'delete' | 'update' | 'review'
}
export interface SchedaMovimentoParsed {
  tipoMovimento: string
  decorrenza: string | null
  cf: string | null
  cognome: string | null
  nome: string | null
  sesso: string | null
  data_nascita: string | null
  comune_nascita: string | null
  provincia_nascita: string | null
  nazione_nascita: string | null
  societa: string | null
  area: string | null
  sotto_area: string | null
  cdc_amministrativo: string | null
  sede: string | null
  tipo_contratto: string | null
  qualifica: string | null
  matricola: string | null
  email: string | null
  job_title: string | null
  referente_diretto: string | null
  telelavoro: string | null
  data_fine_rapporto: string | null
  note: string | null
  provenienza_societa: string | null
  provenienza_area: string | null
  provenienza_sotto_area: string | null
}

export type OrgSubTab = 'posizioni' | 'persone' | 'tns'
export type TipoNodo = 'STRUTTURA' | 'PERSONA' | 'ANOMALIA'

export type AgentNotificationSeverity = 'critical' | 'warning' | 'info' | 'suggestion'
export type AgentNotificationStatus = 'unread' | 'read' | 'actioned' | 'dismissed'

export interface AgentNotification {
  id: string
  agent_type: string
  severity: AgentNotificationSeverity
  title: string
  body: string
  entity_type: string | null
  entity_id: string | null
  proposed_actions: string | null
  status: AgentNotificationStatus
  created_at: string
  actioned_at: string | null
  actioned_by: string | null
}

export interface PinnedView {
  id: string
  label: string
  mode: 'navigate' | 'expand'
  pinnedAt: number
  maxDepth?: number
  nodePositions?: Record<string, { x: number; y: number }>
}
