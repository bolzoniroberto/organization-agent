'use client'
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, ICellRendererParams, CellValueChangedEvent } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'  // includes ag-theme-alpine-dark
import { ChevronRight, Plus, Search, Eye, EyeOff, Columns, Download } from 'lucide-react'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import type { NodoOrganigramma, Persona, StrutturaTns } from '@/types'
import RecordDrawer from '@/components/shared/RecordDrawer'
import ColumnsPanel from './AnagraficaView/ColumnsPanel'
import VariabiliManager from './AnagraficaView/VariabiliManager'
import AnomaliePanels from './AnagraficaView/AnomaliePanels'

type SubTab = 'nodi' | 'persone' | 'tns' | 'strutture-tns' | 'variabili' | 'anomalie'

const NODI_ALL_COLS = [
  { field: 'id', label: 'ID' },
  { field: 'reports_to', label: 'Reports To' },
  { field: 'tipo_nodo', label: 'Tipo' },
  { field: 'cf_persona', label: 'CF Persona' },
  { field: 'nome_uo', label: 'Nome UO' },
  { field: 'nome_uo_2', label: 'Nome UO 2' },
  { field: 'centro_costo', label: 'Centro Costo' },
  { field: 'fte', label: 'FTE' },
  { field: 'job_title', label: 'Job Title' },
  { field: 'funzione', label: 'Funzione' },
  { field: 'processo', label: 'Processo' },
  { field: 'sede', label: 'Sede' },
  { field: 'societa_org', label: 'Società Org' },
  { field: 'tipo_collab', label: 'Tipo Collab' },
]
const NODI_DEFAULT_VISIBLE = new Set(['id', 'reports_to', 'tipo_nodo', 'cf_persona', 'nome_uo', 'centro_costo', 'fte', 'job_title', 'sede'])

const PERSONE_ALL_COLS = [
  { field: 'cf', label: 'CF' },
  { field: 'cognome', label: 'Cognome' },
  { field: 'nome', label: 'Nome' },
  { field: 'email', label: 'Email' },
  { field: 'societa', label: 'Società' },
  { field: 'area', label: 'Area' },
  { field: 'qualifica', label: 'Qualifica' },
  { field: 'tipo_contratto', label: 'Tipo Contratto' },
  { field: 'sede', label: 'Sede' },
  { field: 'modalita_presenze', label: 'Modalità Presenze' },
  { field: 'cdc_amministrativo', label: 'CdC Amm.' },
  { field: 'data_assunzione', label: 'Data Assunzione' },
]
const PERSONE_DEFAULT_VISIBLE = new Set(['cf', 'cognome', 'nome', 'email', 'societa', 'area', 'qualifica', 'sede'])

// 26 colonne esatte del formato TNS ORG (stessa struttura del file Excel)
const TNS_ALL_COLS = [
  { field: '_uo',              label: 'Unità Organizzativa' },
  { field: 'cdc_amministrativo', label: 'CDCCOSTO' },
  { field: 'cf',               label: 'TxCodFiscale' },
  { field: 'livello_tns',      label: 'LIVELLO' },
  { field: '_titolare',        label: 'Titolare' },
  { field: 'padre_tns',        label: "UNITA' OPERATIVA PADRE" },
  { field: 'ruoli_oltrv',      label: 'RUOLI OltreV' },
  { field: 'ruoli_tns_desc',   label: 'RUOLI' },
  { field: 'viaggiatore',      label: 'Viaggiatore' },
  { field: 'segr_redaz',       label: 'Segr_Redaz' },
  { field: 'approvatore',      label: 'Approvatore' },
  { field: 'cassiere',         label: 'Cassiere' },
  { field: 'visualizzatore',   label: 'Visualizzatori' },
  { field: 'segretario',       label: 'Segretario' },
  { field: 'controllore',      label: 'Controllore' },
  { field: 'amministrazione',  label: 'Amministrazione' },
  { field: 'segreteria_red_asst', label: 'SegreteriA Red. Ass.ta' },
  { field: 'segretario_asst',  label: 'SegretariO Ass.to' },
  { field: 'controllore_asst', label: 'Controllore Ass.to' },
  { field: 'ruoli_afc',        label: 'RuoliAFC' },
  { field: 'ruoli_hr',         label: 'RuoliHR' },
  { field: 'altri_ruoli',      label: 'AltriRuoli' },
  { field: 'sede_tns',         label: 'Sede_TNS' },
  { field: 'gruppo_sind',      label: 'GruppoSind' },
]
const TNS_DEFAULT_VISIBLE = new Set(TNS_ALL_COLS.map(c => c.field))

const STRUTT_TNS_ALL_COLS = [
  { field: 'codice', label: 'Codice' },
  { field: 'nome', label: 'Nome' },
  { field: 'padre', label: 'Padre' },
  { field: 'livello', label: 'Livello' },
  { field: 'tipo', label: 'Tipo' },
  { field: 'descrizione', label: 'Descrizione' },
  { field: 'attivo', label: 'Attivo' },
]
const STRUTT_TNS_DEFAULT_VISIBLE = new Set(['codice', 'nome', 'padre', 'livello', 'tipo', 'attivo'])

const TIPO_NODO_BADGE: Record<string, string> = {
  STRUTTURA: 'bg-slate-700 text-slate-300',
  PERSONA: 'bg-indigo-900/50 text-indigo-300',
  ANOMALIA: 'bg-amber-900/50 text-amber-300',
}

export default function AnagraficaView() {
  const { nodi, persone, struttureTns, variabiliDef, variabiliValori, refreshAll, refreshPersone, refreshStruttureTns, showToast, activeView } = useHRStore()
  const tns = useMemo(() => persone.filter(p => p.codice_tns != null), [persone])
  const [subTab, setSubTab] = useState<SubTab>('nodi')
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)
  const [showColumnsPanel, setShowColumnsPanel] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerType, setDrawerType] = useState<'nodo' | 'persona'>('nodo')
  const [drawerRecord, setDrawerRecord] = useState<NodoOrganigramma | Persona | null>(null)
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit' | 'create'>('view')

  const [nodiVisible, setNodiVisible] = useState<Set<string>>(new Set(NODI_DEFAULT_VISIBLE))
  const [personeVisible, setPersoneVisible] = useState<Set<string>>(new Set(PERSONE_DEFAULT_VISIBLE))
  const [tnsVisible, setTnsVisible] = useState<Set<string>>(new Set(TNS_DEFAULT_VISIBLE))
  const [struttTnsVisible, setStruttTnsVisible] = useState<Set<string>>(new Set(STRUTT_TNS_DEFAULT_VISIBLE))
  const [visibleVars, setVisibleVars] = useState<Set<number>>(new Set())

  // Sync subTab from top menu navigation
  useEffect(() => {
    if (activeView === 'ruoli-tns') setSubTab('tns')
    else if (activeView === 'strutture-tns') setSubTab('strutture-tns')
    else if (activeView === 'nodi') setSubTab('nodi')
    else if (activeView === 'persone') setSubTab('persone')
    else if (activeView === 'variabili') setSubTab('variabili')
  }, [activeView])

  const openDrawer = useCallback(
    (type: 'nodo' | 'persona', record: NodoOrganigramma | Persona | null, mode: 'view' | 'edit' | 'create') => {
      setDrawerType(type)
      setDrawerRecord(record)
      setDrawerMode(mode)
      setDrawerOpen(true)
    },
    []
  )

  const handleCellValueChanged = useCallback(async (params: CellValueChangedEvent) => {
    if (params.oldValue === params.newValue) return
    const field = params.colDef.field
    if (!field || field.startsWith('var_')) return
    const newVal = params.newValue ?? ''

    try {
      let result: { success: boolean; error?: string }
      if (subTab === 'nodi') {
        result = await api.org.update((params.data as NodoOrganigramma).id, { [field]: newVal })
      } else if (subTab === 'persone') {
        result = await api.persone.update((params.data as Persona).cf, { [field]: newVal })
      } else if (subTab === 'tns') {
        result = await api.tns.update((params.data as Persona).cf, { [field]: newVal })
      } else {
        result = await api.struttureTns.update((params.data as StrutturaTns).codice, { [field]: newVal })
      }

      if (!result.success) {
        showToast(result.error ?? 'Errore aggiornamento', 'error')
        params.node.setDataValue(field, params.oldValue)
        return
      }
      showToast(`Campo "${field}" aggiornato`, 'success')
      if (subTab === 'tns') await refreshPersone()
      else if (subTab === 'strutture-tns') await refreshStruttureTns()
      else await refreshAll()
    } catch (e) {
      showToast(String(e), 'error')
      params.node.setDataValue(field, params.oldValue)
    }
  }, [subTab, showToast, refreshAll, refreshPersone, refreshStruttureTns])

  // ── ColDef: Nodi ──────────────────────────────────────────────────────────
  const nodiCols: ColDef[] = useMemo(() => {
    const base: ColDef[] = [
      { headerCheckboxSelection: true, checkboxSelection: true, width: 40, minWidth: 40, maxWidth: 40, pinned: 'left' as const, sortable: false, filter: false, floatingFilter: false, editable: false, suppressFillHandle: true, resizable: false, suppressMovable: true },
    ]
    const colMap: Record<string, ColDef> = {
      id: { field: 'id', headerName: 'ID', width: 160, editable: false, suppressFillHandle: true, cellClass: 'font-mono text-xs text-slate-400' },
      reports_to: { field: 'reports_to', headerName: 'Reports To', width: 130, editable: true, cellClass: 'font-mono text-xs text-slate-400' },
      tipo_nodo: { field: 'tipo_nodo', headerName: 'Tipo', width: 110, editable: false, suppressFillHandle: true,
        cellRenderer: (p: ICellRendererParams) => p.value
          ? <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TIPO_NODO_BADGE[p.value] ?? 'bg-slate-700 text-slate-300'}`}>{p.value}</span>
          : null
      },
      cf_persona: { field: 'cf_persona', headerName: 'CF Persona', width: 150, editable: true, cellClass: 'font-mono text-xs text-slate-400' },
      nome_uo: { field: 'nome_uo', headerName: 'Nome UO', flex: 2, editable: true, cellClass: 'text-sm text-slate-200' },
      nome_uo_2: { field: 'nome_uo_2', headerName: 'Nome UO 2', flex: 1, editable: true, cellClass: 'text-sm text-slate-300' },
      centro_costo: { field: 'centro_costo', headerName: 'Centro Costo', width: 120, editable: true, cellClass: 'text-xs text-slate-400' },
      fte: { field: 'fte', headerName: 'FTE', width: 80, editable: true, type: 'numericColumn', cellClass: 'text-xs text-slate-400 text-center' },
      job_title: { field: 'job_title', headerName: 'Job Title', flex: 1.5, editable: true, cellClass: 'text-sm text-slate-300' },
      funzione: { field: 'funzione', headerName: 'Funzione', flex: 1, editable: true, cellClass: 'text-xs text-slate-400' },
      processo: { field: 'processo', headerName: 'Processo', flex: 1, editable: true, cellClass: 'text-xs text-slate-400' },
      sede: { field: 'sede', headerName: 'Sede', width: 110, editable: true, cellClass: 'text-xs text-slate-400' },
      societa_org: { field: 'societa_org', headerName: 'Società Org', width: 120, editable: true, cellClass: 'text-xs text-slate-400' },
      tipo_collab: { field: 'tipo_collab', headerName: 'Tipo Collab', width: 120, editable: true, cellClass: 'text-xs text-slate-400' },
    }
    NODI_ALL_COLS.filter(c => nodiVisible.has(c.field)).forEach(c => { if (colMap[c.field]) base.push(colMap[c.field]) })
    variabiliDef.filter(v => visibleVars.has(v.id) && (v.target === 'nodo' || v.target === 'tutti')).forEach(v => {
      base.push({ field: `var_${v.id}`, headerName: v.label, width: 130, editable: true, cellClass: 'text-xs text-indigo-300', headerClass: 'italic' })
    })
    base.push({
      headerName: '', width: 46, pinned: 'right', sortable: false, editable: false, filter: false, floatingFilter: false, suppressFillHandle: true,
      cellRenderer: (p: ICellRendererParams) => (
        <button onClick={() => openDrawer('nodo', p.data, 'view')} className="flex items-center justify-center w-full h-full text-slate-600 hover:text-slate-300">
          <ChevronRight className="w-4 h-4" />
        </button>
      )
    })
    return base
  }, [nodiVisible, variabiliDef, visibleVars, openDrawer])

  // ── ColDef: Persone ───────────────────────────────────────────────────────
  const personeCols: ColDef[] = useMemo(() => {
    const base: ColDef[] = [
      { headerCheckboxSelection: true, checkboxSelection: true, width: 40, minWidth: 40, maxWidth: 40, pinned: 'left' as const, sortable: false, filter: false, floatingFilter: false, editable: false, suppressFillHandle: true, resizable: false, suppressMovable: true },
    ]
    const colMap: Record<string, ColDef> = {
      cf: { field: 'cf', headerName: 'CF', width: 160, editable: false, suppressFillHandle: true, cellClass: 'font-mono text-xs text-slate-400' },
      cognome: { field: 'cognome', headerName: 'Cognome', flex: 1.5, editable: true, cellClass: 'text-sm text-slate-200 font-medium' },
      nome: { field: 'nome', headerName: 'Nome', flex: 1.5, editable: true, cellClass: 'text-sm text-slate-200' },
      email: { field: 'email', headerName: 'Email', flex: 2, editable: true, cellClass: 'text-xs text-slate-400' },
      societa: { field: 'societa', headerName: 'Società', width: 120, editable: true, cellClass: 'text-xs text-slate-400' },
      area: { field: 'area', headerName: 'Area', flex: 1, editable: true, cellClass: 'text-xs text-slate-400' },
      qualifica: { field: 'qualifica', headerName: 'Qualifica', flex: 1, editable: true, cellClass: 'text-xs text-slate-400' },
      tipo_contratto: { field: 'tipo_contratto', headerName: 'Contratto', width: 110, editable: true, cellClass: 'text-xs text-slate-400' },
      sede: { field: 'sede', headerName: 'Sede', width: 110, editable: true, cellClass: 'text-xs text-slate-400' },
      modalita_presenze: { field: 'modalita_presenze', headerName: 'Presenze', width: 100, editable: true, cellClass: 'text-xs text-slate-400' },
      cdc_amministrativo: { field: 'cdc_amministrativo', headerName: 'CdC Amm.', width: 110, editable: true, cellClass: 'text-xs text-slate-400' },
      data_assunzione: { field: 'data_assunzione', headerName: 'Assunzione', width: 110, editable: true, cellClass: 'text-xs text-slate-400' },
    }
    PERSONE_ALL_COLS.filter(c => personeVisible.has(c.field)).forEach(c => { if (colMap[c.field]) base.push(colMap[c.field]) })
    variabiliDef.filter(v => visibleVars.has(v.id) && (v.target === 'persona' || v.target === 'tutti')).forEach(v => {
      base.push({ field: `var_${v.id}`, headerName: v.label, width: 130, editable: true, cellClass: 'text-xs text-indigo-300', headerClass: 'italic' })
    })
    base.push({
      headerName: '', width: 46, pinned: 'right', sortable: false, editable: false, filter: false, floatingFilter: false, suppressFillHandle: true,
      cellRenderer: (p: ICellRendererParams) => (
        <button onClick={() => openDrawer('persona', p.data, 'view')} className="flex items-center justify-center w-full h-full text-slate-600 hover:text-slate-300">
          <ChevronRight className="w-4 h-4" />
        </button>
      )
    })
    return base
  }, [personeVisible, variabiliDef, visibleVars, openDrawer])

  // ── ColDef: TNS (26 colonne formato TNS ORG) ─────────────────────────────
  const tnsCols: ColDef[] = useMemo(() => {
    const base: ColDef[] = [
      { headerCheckboxSelection: true, checkboxSelection: true, headerCheckboxSelectionFilteredOnly: true, width: 40, minWidth: 40, maxWidth: 40, pinned: 'left' as const, sortable: false, filter: false, floatingFilter: false, editable: false, suppressFillHandle: true, resizable: false, suppressMovable: true },
    ]
    const colMap: Record<string, ColDef> = {
      _uo:               { field: '_uo',               headerName: 'Unità Organizzativa',      width: 180, editable: false, cellClass: 'text-xs text-slate-400' },
      cdc_amministrativo:{ field: 'cdc_amministrativo', headerName: 'CDCCOSTO',                width: 100, editable: true,  cellClass: 'font-mono text-xs text-slate-400' },
      cf:                { field: 'cf',                headerName: 'TxCodFiscale',             width: 160, editable: false, suppressFillHandle: true, cellClass: 'font-mono text-xs text-slate-400' },
      livello_tns:       { field: 'livello_tns',       headerName: 'LIVELLO',                  width: 90,  editable: true,  cellClass: 'text-xs text-slate-300' },
      _titolare:         { field: '_titolare',         headerName: 'Titolare',                 flex: 1.5,  editable: false, cellClass: 'text-sm text-slate-200 font-medium' },
      padre_tns:         { field: 'padre_tns',         headerName: "UNITA' OPERATIVA PADRE",   width: 160, editable: true,  cellClass: 'font-mono text-xs text-slate-400' },
      ruoli_oltrv:       { field: 'ruoli_oltrv',       headerName: 'RUOLI OltreV',             width: 130, editable: true,  cellClass: 'text-xs text-slate-400' },
      ruoli_tns_desc:    { field: 'ruoli_tns_desc',    headerName: 'RUOLI',                    width: 130, editable: true,  cellClass: 'text-xs text-slate-400' },
      viaggiatore:       { field: 'viaggiatore',       headerName: 'Viaggiatore',              width: 100, editable: true,  cellClass: 'text-xs text-slate-400' },
      segr_redaz:        { field: 'segr_redaz',        headerName: 'Segr_Redaz',               width: 110, editable: true,  cellClass: 'text-xs text-slate-400' },
      approvatore:       { field: 'approvatore',       headerName: 'Approvatore',              width: 110, editable: true,  cellClass: 'text-xs text-slate-400' },
      cassiere:          { field: 'cassiere',          headerName: 'Cassiere',                 width: 100, editable: true,  cellClass: 'text-xs text-slate-400' },
      visualizzatore:    { field: 'visualizzatore',    headerName: 'Visualizzatori',           width: 110, editable: true,  cellClass: 'text-xs text-slate-400' },
      segretario:        { field: 'segretario',        headerName: 'Segretario',               width: 100, editable: true,  cellClass: 'text-xs text-slate-400' },
      controllore:       { field: 'controllore',       headerName: 'Controllore',              width: 110, editable: true,  cellClass: 'text-xs text-slate-400' },
      amministrazione:   { field: 'amministrazione',   headerName: 'Amministrazione',          width: 130, editable: true,  cellClass: 'text-xs text-slate-400' },
      segreteria_red_asst:{ field: 'segreteria_red_asst', headerName: 'SegreteriA Red. Ass.ta', width: 155, editable: true, cellClass: 'text-xs text-slate-400' },
      segretario_asst:   { field: 'segretario_asst',   headerName: 'SegretariO Ass.to',       width: 140, editable: true,  cellClass: 'text-xs text-slate-400' },
      controllore_asst:  { field: 'controllore_asst',  headerName: 'Controllore Ass.to',      width: 140, editable: true,  cellClass: 'text-xs text-slate-400' },
      ruoli_afc:         { field: 'ruoli_afc',         headerName: 'RuoliAFC',                width: 110, editable: true,  cellClass: 'text-xs text-slate-400' },
      ruoli_hr:          { field: 'ruoli_hr',          headerName: 'RuoliHR',                 width: 100, editable: true,  cellClass: 'text-xs text-slate-400' },
      altri_ruoli:       { field: 'altri_ruoli',       headerName: 'AltriRuoli',              width: 120, editable: true,  cellClass: 'text-xs text-slate-400' },
      sede_tns:          { field: 'sede_tns',          headerName: 'Sede_TNS',                width: 110, editable: true,  cellClass: 'text-xs text-slate-400' },
      gruppo_sind:       { field: 'gruppo_sind',       headerName: 'GruppoSind',              width: 120, editable: true,  cellClass: 'text-xs text-slate-400' },
    }
    TNS_ALL_COLS.filter(c => tnsVisible.has(c.field)).forEach(c => { if (colMap[c.field]) base.push(colMap[c.field]) })
    variabiliDef.filter(v => visibleVars.has(v.id) && (v.target === 'tns' || v.target === 'tutti')).forEach(v => {
      base.push({ field: `var_${v.id}`, headerName: v.label, width: 130, editable: true, cellClass: 'text-xs text-indigo-300', headerClass: 'italic' })
    })
    return base
  }, [tnsVisible, variabiliDef, visibleVars])

  // ── ColDef: Strutture TNS ─────────────────────────────────────────────────
  const struttTnsCols: ColDef[] = useMemo(() => {
    const base: ColDef[] = [
      { headerCheckboxSelection: true, checkboxSelection: true, width: 40, minWidth: 40, maxWidth: 40, pinned: 'left' as const, sortable: false, filter: false, floatingFilter: false, editable: false, suppressFillHandle: true, resizable: false, suppressMovable: true },
    ]
    const colMap: Record<string, ColDef> = {
      codice: { field: 'codice', headerName: 'Codice', width: 130, editable: false, suppressFillHandle: true, cellClass: 'font-mono text-xs text-slate-400' },
      nome: { field: 'nome', headerName: 'Nome', flex: 2, editable: true, cellClass: 'text-sm text-slate-200' },
      padre: { field: 'padre', headerName: 'Padre', width: 130, editable: true, cellClass: 'font-mono text-xs text-slate-400' },
      livello: { field: 'livello', headerName: 'Livello', width: 100, editable: true, cellClass: 'text-xs text-slate-300' },
      tipo: { field: 'tipo', headerName: 'Tipo', width: 110, editable: true, cellClass: 'text-xs text-slate-400' },
      descrizione: { field: 'descrizione', headerName: 'Descrizione', flex: 1.5, editable: true, cellClass: 'text-xs text-slate-400' },
      attivo: { field: 'attivo', headerName: 'Attivo', width: 80, editable: true, type: 'numericColumn', cellClass: 'text-xs text-center text-slate-400' },
    }
    STRUTT_TNS_ALL_COLS.filter(c => struttTnsVisible.has(c.field)).forEach(c => { if (colMap[c.field]) base.push(colMap[c.field]) })
    variabiliDef.filter(v => visibleVars.has(v.id) && (v.target === 'struttura_tns' || v.target === 'tutti')).forEach(v => {
      base.push({ field: `var_${v.id}`, headerName: v.label, width: 130, editable: true, cellClass: 'text-xs text-indigo-300', headerClass: 'italic' })
    })
    base.push({
      headerName: '', width: 46, pinned: 'right', sortable: false, editable: false, filter: false, floatingFilter: false, suppressFillHandle: true,
      cellRenderer: (p: ICellRendererParams) => (
        <button onClick={() => { /* TODO: struttura drawer */ }} className="flex items-center justify-center w-full h-full text-slate-600 hover:text-slate-300">
          <ChevronRight className="w-4 h-4" />
        </button>
      )
    })
    return base
  }, [struttTnsVisible, variabiliDef, visibleVars])

  // ── Merge variabili values into row data ──────────────────────────────────
  const vByEntityId = useMemo(() => {
    const map = new Map<string, Record<string, string | null>>()
    for (const v of variabiliValori) {
      const key = `${v.entita_tipo}::${v.entita_id}`
      if (!map.has(key)) map.set(key, {})
      map.get(key)![`var_${v.var_id}`] = v.valore
    }
    return map
  }, [variabiliValori])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withVars = (rows: any[], tipo: string, idField: string): any[] =>
    rows.map(r => ({ ...r, ...vByEntityId.get(`${tipo}::${String(r[idField])}`) }))

  // ── Filtered data ─────────────────────────────────────────────────────────
  const filteredNodi = useMemo(() => {
    const lower = search.toLowerCase()
    return nodi.filter(n => {
      if (!showDeleted && n.deleted_at) return false
      if (!search) return true
      return n.id?.toLowerCase().includes(lower) || n.nome_uo?.toLowerCase().includes(lower) ||
        n.cf_persona?.toLowerCase().includes(lower) || n.centro_costo?.toLowerCase().includes(lower)
    })
  }, [nodi, search, showDeleted])

  const filteredPersone = useMemo(() => {
    const lower = search.toLowerCase()
    return persone.filter(p => {
      if (!showDeleted && p.deleted_at) return false
      if (!search) return true
      return p.cf?.toLowerCase().includes(lower) || p.cognome?.toLowerCase().includes(lower) ||
        p.nome?.toLowerCase().includes(lower) || p.email?.toLowerCase().includes(lower)
    })
  }, [persone, search, showDeleted])

  const filteredTns = useMemo(() => {
    const withDerived = tns.map(p => ({
      ...p,
      _uo: p.societa ?? '',
      _titolare: [p.cognome, p.nome].filter(Boolean).join(' '),
    }))
    if (!search) return withDerived
    const lower = search.toLowerCase()
    return withDerived.filter(t =>
      t.cf?.toLowerCase().includes(lower) ||
      t.cognome?.toLowerCase().includes(lower) ||
      t.nome?.toLowerCase().includes(lower) ||
      t.codice_tns?.toLowerCase().includes(lower) ||
      t.sede_tns?.toLowerCase().includes(lower) ||
      t._titolare.toLowerCase().includes(lower)
    )
  }, [tns, search])

  const filteredStruttTns = useMemo(() => {
    if (!search) return struttureTns
    const lower = search.toLowerCase()
    return struttureTns.filter(s =>
      s.codice?.toLowerCase().includes(lower) ||
      s.nome?.toLowerCase().includes(lower) ||
      s.tipo?.toLowerCase().includes(lower)
    )
  }, [struttureTns, search])

  const getRowClass = (params: { data?: { deleted_at?: string | null } }) =>
    params.data?.deleted_at ? 'opacity-50 line-through' : ''

  // ── Columns panel meta ────────────────────────────────────────────────────
  const visibleCols = subTab === 'nodi' ? nodiVisible : subTab === 'persone' ? personeVisible : subTab === 'strutture-tns' ? struttTnsVisible : tnsVisible
  const setVisibleCols = subTab === 'nodi' ? setNodiVisible : subTab === 'persone' ? setPersoneVisible : subTab === 'strutture-tns' ? setStruttTnsVisible : setTnsVisible
  const allCols = subTab === 'nodi' ? NODI_ALL_COLS : subTab === 'persone' ? PERSONE_ALL_COLS : subTab === 'strutture-tns' ? STRUTT_TNS_ALL_COLS : TNS_ALL_COLS
  const defaultCols = subTab === 'nodi' ? NODI_DEFAULT_VISIBLE : subTab === 'persone' ? PERSONE_DEFAULT_VISIBLE : subTab === 'strutture-tns' ? STRUTT_TNS_DEFAULT_VISIBLE : TNS_DEFAULT_VISIBLE
  const canShowColumnsPanel = subTab === 'nodi' || subTab === 'persone' || subTab === 'tns' || subTab === 'strutture-tns'
  const isGridTab = subTab === 'nodi' || subTab === 'persone' || subTab === 'tns' || subTab === 'strutture-tns'

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex gap-1">
          {(['nodi', 'persone', 'tns', 'strutture-tns', 'variabili', 'anomalie'] as SubTab[]).map(tab => (
            <button key={tab} onClick={() => { setSubTab(tab); setSearch('') }}
              className={['px-3 py-1.5 text-sm rounded-md transition-colors',
                subTab === tab ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              ].join(' ')}>
              {tab === 'nodi' ? `Nodi (${nodi.filter(n => !n.deleted_at).length})` :
               tab === 'persone' ? `Persone (${persone.filter(p => !p.deleted_at).length})` :
               tab === 'tns' ? `Ruoli TNS (${persone.filter(p => p.codice_tns != null).length})` :
               tab === 'strutture-tns' ? `Strutture TNS (${struttureTns.length})` :
               tab === 'variabili' ? 'Variabili' : 'Anomalie'}
            </button>
          ))}
        </div>

        {isGridTab && (
          <>
            <div className="flex-1" />

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input type="text" placeholder="Cerca..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md w-52 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>

            {subTab !== 'tns' && subTab !== 'strutture-tns' && (
              <button onClick={() => setShowDeleted(v => !v)}
                className={['flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border transition-colors',
                  showDeleted ? 'bg-red-900/20 border-red-700 text-red-300' : 'border-slate-600 text-slate-400 hover:text-slate-200'
                ].join(' ')}>
                {showDeleted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Eliminati</span>
              </button>
            )}

            <button onClick={() => setShowColumnsPanel(true)}
              className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border border-slate-600 text-slate-400 hover:text-slate-200 transition-colors">
              <Columns className="w-3.5 h-3.5" />
              Colonne
            </button>

            {subTab !== 'tns' && subTab !== 'strutture-tns' && (
              <button
                onClick={() => openDrawer(subTab === 'nodi' ? 'nodo' : 'persona', null, 'create')}
                className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors font-medium">
                <Plus className="w-3.5 h-3.5" />
                Aggiungi
              </button>
            )}

            {subTab === 'tns' ? (
              <button
                onClick={() => { const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''; const a = document.createElement('a'); a.href = `${base}/api/export/tns-org`; a.download = ''; document.body.appendChild(a); a.click(); a.remove() }}
                className="flex items-center gap-1.5 text-sm border border-green-700 text-green-400 hover:text-green-300 hover:border-green-600 px-2.5 py-1.5 rounded-md transition-colors">
                <Download className="w-3.5 h-3.5" />
                TNS ORG XLS
              </button>
            ) : (
              <button
                onClick={() => { const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''; const a = document.createElement('a'); a.href = `${base}/api/export`; a.download = ''; document.body.appendChild(a); a.click(); a.remove() }}
                className="flex items-center gap-1.5 text-sm border border-slate-600 text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-md transition-colors">
                <Download className="w-3.5 h-3.5" />
                XLS
              </button>
            )}
          </>
        )}
      </div>

      {isGridTab && (
        <div className="px-4 py-1 bg-slate-900 border-b border-slate-800 text-xs text-slate-600">
          Doppio click su cella per modificare{subTab !== 'tns' && subTab !== 'strutture-tns' ? ' · → per scheda completa' : ''}
        </div>
      )}

      <div className="flex-1 ag-theme-alpine-dark overflow-hidden">
        {subTab === 'nodi' && (
          <AgGridReact
            rowData={withVars(filteredNodi, 'nodo_org', 'id')}
            columnDefs={nodiCols}
            defaultColDef={{ resizable: true, sortable: true, filter: true, floatingFilter: true }}
            getRowClass={getRowClass}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            onCellValueChanged={handleCellValueChanged}
            stopEditingWhenCellsLoseFocus={true}
            animateRows={true}
            rowHeight={36}
            headerHeight={36}
          />
        )}
        {subTab === 'persone' && (
          <AgGridReact
            rowData={withVars(filteredPersone, 'persona', 'cf')}
            columnDefs={personeCols}
            defaultColDef={{ resizable: true, sortable: true, filter: true, floatingFilter: true }}
            getRowClass={getRowClass}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            onCellValueChanged={handleCellValueChanged}
            stopEditingWhenCellsLoseFocus={true}
            animateRows={true}
            rowHeight={36}
            headerHeight={36}
          />
        )}
        {subTab === 'tns' && (
          <AgGridReact
            rowData={withVars(filteredTns, 'persona', 'cf')}
            columnDefs={tnsCols}
            defaultColDef={{ resizable: true, sortable: true, filter: true, floatingFilter: true }}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            onCellValueChanged={handleCellValueChanged}
            stopEditingWhenCellsLoseFocus={true}
            animateRows={true}
            rowHeight={36}
            headerHeight={36}
          />
        )}
        {subTab === 'strutture-tns' && (
          <AgGridReact
            rowData={withVars(filteredStruttTns, 'struttura_tns', 'codice')}
            columnDefs={struttTnsCols}
            defaultColDef={{ resizable: true, sortable: true, filter: true, floatingFilter: true }}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            onCellValueChanged={handleCellValueChanged}
            stopEditingWhenCellsLoseFocus={true}
            animateRows={true}
            rowHeight={36}
            headerHeight={36}
          />
        )}
        {subTab === 'variabili' && <VariabiliManager />}
        {subTab === 'anomalie' && <AnomaliePanels />}
      </div>

      {showColumnsPanel && canShowColumnsPanel && (
        <ColumnsPanel
          entityType={subTab as 'nodi' | 'persone' | 'tns' | 'strutture-tns'}
          allColumns={allCols}
          visibleColumns={visibleCols}
          onToggle={field => {
            setVisibleCols(prev => {
              const next = new Set(prev)
              if (next.has(field)) next.delete(field)
              else next.add(field)
              return next
            })
          }}
          onReset={() => setVisibleCols(new Set(defaultCols))}
          onClose={() => setShowColumnsPanel(false)}
          variabili={variabiliDef}
          visibleVars={visibleVars}
          onToggleVar={varId => setVisibleVars(prev => {
            const next = new Set(prev)
            if (next.has(varId)) next.delete(varId)
            else next.add(varId)
            return next
          })}
        />
      )}

      <RecordDrawer
        open={drawerOpen}
        type={drawerType}
        record={drawerRecord ?? undefined}
        initialMode={drawerMode}
        onClose={() => setDrawerOpen(false)}
        onSaved={refreshAll}
      />
    </div>
  )
}
