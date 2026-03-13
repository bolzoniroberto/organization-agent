'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, SelectionChangedEvent } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Info, Trash2 } from 'lucide-react'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import type { CleaningProposal } from '@/types'

type SubTab = 'dc-duplicati' | 'dc-bulk-edit' | 'dc-merge'

// ─── Severity badge ────────────────────────────────────────────────────────
function SeverityBadge({ s }: { s: CleaningProposal['severity'] }) {
  const cls = s === 'high'
    ? 'bg-red-900/50 text-red-300 border-red-700'
    : s === 'medium'
    ? 'bg-amber-900/50 text-amber-300 border-amber-700'
    : 'bg-slate-700 text-slate-400 border-slate-600'
  return <span className={`px-1.5 py-0.5 text-xs rounded border ${cls}`}>{s}</span>
}

// ─── Proposte sub-tab ──────────────────────────────────────────────────────
function ProposteTab() {
  const { showToast, refreshPersone, refreshNodi, refreshTimesheet } = useHRStore()
  const [proposals, setProposals] = useState<CleaningProposal[]>([])
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [mergeTarget, setMergeTarget] = useState<CleaningProposal | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.dataCleaning.proposals()
      setProposals(data)
      // auto-open groups
      const groups = new Set(data.map(p => p.tipo))
      setOpen(groups)
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load() }, [load])

  const visible = proposals.filter(p => !dismissed.has(p.id))

  // Group by tipo
  const groups: Record<string, CleaningProposal[]> = {}
  for (const p of visible) {
    if (!groups[p.tipo]) groups[p.tipo] = []
    groups[p.tipo].push(p)
  }

  const toggleGroup = (tipo: string) => {
    setOpen(prev => {
      const n = new Set(prev)
      n.has(tipo) ? n.delete(tipo) : n.add(tipo)
      return n
    })
  }

  const handleDelete = async (p: CleaningProposal) => {
    if (!confirm(`Eliminare il record ${p.records[0]?.cf ?? p.records[0]?.id ?? ''}?`)) return
    try {
      const r = p.records[0]
      if (p.entityType === 'persona') {
        await api.persone.delete(String(r.cf))
        await refreshPersone()
      } else if (p.entityType === 'nodo') {
        await api.org.delete(String(r.id))
        await refreshNodi()
      } else if (p.entityType === 'timesheet') {
        await api.timesheet.delete(String(r.cf_dipendente))
        await refreshTimesheet()
      }
      showToast('Record eliminato', 'success')
      setDismissed(prev => new Set([...prev, p.id]))
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  const SeverityIcon = ({ s }: { s: CleaningProposal['severity'] }) => {
    if (s === 'high') return <AlertCircle className="w-3.5 h-3.5 text-red-400" />
    if (s === 'medium') return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
    return <Info className="w-3.5 h-3.5 text-slate-400" />
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 flex-none">
        <span className="text-sm text-slate-400">{visible.length} proposte attive</span>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          Ricalcola
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <div className="text-slate-500 text-sm text-center py-8">Analisi in corso…</div>}
        {!loading && visible.length === 0 && (
          <div className="text-slate-500 text-sm text-center py-8">Nessuna anomalia rilevata</div>
        )}
        {Object.entries(groups).map(([tipo, items]) => (
          <div key={tipo} className="border border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleGroup(tipo)}
              className="w-full flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-750 text-left"
            >
              {open.has(tipo) ? <ChevronDown className="w-4 h-4 text-slate-400 flex-none" /> : <ChevronRight className="w-4 h-4 text-slate-400 flex-none" />}
              <span className="text-sm font-medium text-slate-200 flex-1">{tipo.replace(/_/g, ' ')}</span>
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{items.length}</span>
            </button>
            {open.has(tipo) && (
              <div className="divide-y divide-slate-700/50">
                {items.map(p => (
                  <div key={p.id} className="flex items-start gap-3 px-4 py-2.5 bg-slate-900 hover:bg-slate-800/50">
                    <SeverityIcon s={p.severity} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300">{p.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {p.records.length} record · {p.entityType}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-none">
                      <SeverityBadge s={p.severity} />
                      {p.suggestedAction === 'merge' && (
                        <button
                          onClick={() => setMergeTarget(p)}
                          className="px-2 py-1 text-xs bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-700 rounded transition-colors"
                        >
                          Unisci
                        </button>
                      )}
                      {p.suggestedAction === 'delete' && (
                        <button
                          onClick={() => handleDelete(p)}
                          className="px-2 py-1 text-xs bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-800 rounded transition-colors"
                        >
                          Elimina
                        </button>
                      )}
                      <button
                        onClick={() => setDismissed(prev => new Set([...prev, p.id]))}
                        className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-400 rounded transition-colors"
                      >
                        Ignora
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {mergeTarget && (
        <QuickMergeModal
          proposal={mergeTarget}
          onClose={() => setMergeTarget(null)}
          onDone={() => { setMergeTarget(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Quick merge modal (da proposte) ──────────────────────────────────────
function QuickMergeModal({ proposal, onClose, onDone }: {
  proposal: CleaningProposal
  onClose: () => void
  onDone: () => void
}) {
  const { showToast, refreshPersone, refreshNodi } = useHRStore()
  const [survivorIdx, setSurvivorIdx] = useState(0)
  const [loading, setLoading] = useState(false)
  const records = proposal.records

  const handleMerge = async () => {
    const survivor = records[survivorIdx]
    const victim = records[survivorIdx === 0 ? 1 : 0]
    const entityType = proposal.entityType === 'persona' ? 'persone' : 'nodi' as 'persone' | 'nodi'
    const survivorId = String(proposal.entityType === 'persona' ? survivor.cf : survivor.id)
    const victimId = String(proposal.entityType === 'persona' ? victim.cf : victim.id)

    setLoading(true)
    try {
      await api.dataCleaning.merge({ entityType, survivorId, victimId })
      if (proposal.entityType === 'persona') await refreshPersone()
      else await refreshNodi()
      showToast('Merge completato', 'success')
      onDone()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-base font-semibold text-slate-200">Merge rapido</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-400">{proposal.label}</p>
          <div className="space-y-2">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Seleziona il record da mantenere (survivor)</p>
            {records.slice(0, 2).map((r, i) => (
              <button
                key={i}
                onClick={() => setSurvivorIdx(i)}
                className={[
                  'w-full text-left px-3 py-2 rounded border text-sm transition-colors',
                  survivorIdx === i
                    ? 'border-indigo-500 bg-indigo-900/30 text-slate-200'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500'
                ].join(' ')}
              >
                <span className="font-mono text-xs text-slate-500 mr-2">[{i === survivorIdx ? 'SURVIVOR' : 'victim'}]</span>
                {proposal.entityType === 'persona'
                  ? `${r.cognome ?? ''} ${r.nome ?? ''} · CF: ${r.cf}`
                  : `${r.nome_uo ?? r.id}`
                }
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-700">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">Annulla</button>
          <button
            onClick={handleMerge}
            disabled={loading}
            className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'Merge…' : 'Esegui merge'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Bulk edit — campi modificabili per entità ─────────────────────────────
const BULK_FIELDS: Record<string, { value: string; label: string }[]> = {
  persone: [
    { value: 'cognome', label: 'Cognome' }, { value: 'nome', label: 'Nome' },
    { value: 'email', label: 'Email' }, { value: 'sesso', label: 'Sesso' },
    { value: 'societa', label: 'Società' }, { value: 'area', label: 'Area' },
    { value: 'sotto_area', label: 'Sotto Area' }, { value: 'sede', label: 'Sede' },
    { value: 'cdc_amministrativo', label: 'CdC Amm.' }, { value: 'tipo_contratto', label: 'Tipo Contratto' },
    { value: 'qualifica', label: 'Qualifica' }, { value: 'livello', label: 'Livello' },
    { value: 'modalita_presenze', label: 'Modalità Presenze' }, { value: 'part_time', label: 'Part Time' },
    { value: 'matricola', label: 'Matricola' }, { value: 'data_assunzione', label: 'Data Assunzione' },
    { value: 'data_fine_rapporto', label: 'Data Fine Rapporto' },
  ],
  nodi: [
    { value: 'nome_uo', label: 'Nome UO' }, { value: 'funzione', label: 'Funzione' },
    { value: 'processo', label: 'Processo' }, { value: 'sede', label: 'Sede' },
    { value: 'societa_org', label: 'Società Org' }, { value: 'tipo_collab', label: 'Tipo Collab' },
    { value: 'job_title', label: 'Job Title' }, { value: 'centro_costo', label: 'Centro Costo' },
    { value: 'tipo_nodo', label: 'Tipo Nodo' },
  ],
  'strutture-tns': [
    { value: 'nome', label: 'Nome' }, { value: 'livello', label: 'Livello' },
    { value: 'tipo', label: 'Tipo' }, { value: 'descrizione', label: 'Descrizione' },
    { value: 'cdc', label: 'CdC' }, { value: 'sede_tns', label: 'Sede TNS' },
    { value: 'titolare', label: 'Titolare' }, { value: 'cf_titolare', label: 'CF Titolare' },
  ],
}

// ─── Colonne grid complete per entità ──────────────────────────────────────
const BASE_COLS: Record<string, ColDef[]> = {
  persone: [
    { field: 'cf', headerName: 'CF', width: 150, pinned: 'left', checkboxSelection: true, headerCheckboxSelection: true, headerCheckboxSelectionFilteredOnly: true },
    { field: 'cognome', headerName: 'Cognome', width: 140 },
    { field: 'nome', headerName: 'Nome', width: 120 },
    { field: 'data_nascita', headerName: 'Data Nasc.', width: 110 },
    { field: 'sesso', headerName: 'Sesso', width: 70 },
    { field: 'email', headerName: 'Email', width: 200 },
    { field: 'societa', headerName: 'Società', width: 130 },
    { field: 'area', headerName: 'Area', width: 130 },
    { field: 'sotto_area', headerName: 'Sotto Area', width: 130 },
    { field: 'cdc_amministrativo', headerName: 'CdC Amm.', width: 120 },
    { field: 'sede', headerName: 'Sede', width: 110 },
    { field: 'data_assunzione', headerName: 'Data Ass.', width: 110 },
    { field: 'data_fine_rapporto', headerName: 'Fine Rapp.', width: 110 },
    { field: 'tipo_contratto', headerName: 'Tipo Contr.', width: 120 },
    { field: 'qualifica', headerName: 'Qualifica', width: 140 },
    { field: 'livello', headerName: 'Livello', width: 80 },
    { field: 'modalita_presenze', headerName: 'Mod. Presenze', width: 130 },
    { field: 'part_time', headerName: 'Part Time', width: 90 },
    { field: 'matricola', headerName: 'Matricola', width: 100 },
    { field: 'codice_tns', headerName: 'Cod. TNS', width: 160 },
    { field: 'padre_tns', headerName: 'Padre TNS', width: 140 },
    { field: 'livello_tns', headerName: 'Liv. TNS', width: 90 },
    { field: 'titolare_tns', headerName: 'Titolare TNS', width: 130 },
    { field: 'sede_tns', headerName: 'Sede TNS', width: 110 },
    { field: 'viaggiatore', headerName: 'Viaggiatore', width: 100 },
    { field: 'approvatore', headerName: 'Approvatore', width: 100 },
    { field: 'cassiere', headerName: 'Cassiere', width: 90 },
    { field: 'segretario', headerName: 'Segretario', width: 100 },
    { field: 'controllore', headerName: 'Controllore', width: 100 },
    { field: 'ruoli_tns_desc', headerName: 'Ruoli TNS', width: 140 },
    { field: 'gruppo_sind', headerName: 'Gruppo Sind.', width: 120 },
  ],
  nodi: [
    { field: 'id', headerName: 'ID', width: 200, pinned: 'left', checkboxSelection: true, headerCheckboxSelection: true, headerCheckboxSelectionFilteredOnly: true },
    { field: 'nome_uo', headerName: 'Nome UO', width: 200 },
    { field: 'tipo_nodo', headerName: 'Tipo', width: 100 },
    { field: 'cf_persona', headerName: 'CF Persona', width: 150 },
    { field: 'reports_to', headerName: 'Reports To', width: 200 },
    { field: 'centro_costo', headerName: 'CdC', width: 130 },
    { field: 'funzione', headerName: 'Funzione', width: 140 },
    { field: 'processo', headerName: 'Processo', width: 140 },
    { field: 'sede', headerName: 'Sede', width: 110 },
    { field: 'societa_org', headerName: 'Società Org', width: 130 },
    { field: 'tipo_collab', headerName: 'Tipo Collab', width: 120 },
    { field: 'job_title', headerName: 'Job Title', width: 150 },
  ],
  'strutture-tns': [
    { field: 'codice', headerName: 'Codice', width: 150, pinned: 'left', checkboxSelection: true, headerCheckboxSelection: true, headerCheckboxSelectionFilteredOnly: true },
    { field: 'nome', headerName: 'Nome', width: 200 },
    { field: 'padre', headerName: 'Padre', width: 150 },
    { field: 'livello', headerName: 'Livello', width: 80 },
    { field: 'tipo', headerName: 'Tipo', width: 100 },
    { field: 'attivo', headerName: 'Attivo', width: 70 },
    { field: 'cdc', headerName: 'CdC', width: 110 },
    { field: 'titolare', headerName: 'Titolare', width: 140 },
    { field: 'cf_titolare', headerName: 'CF Titolare', width: 150 },
    { field: 'sede_tns', headerName: 'Sede TNS', width: 110 },
    { field: 'descrizione', headerName: 'Descrizione', width: 200 },
  ],
}

// ─── Var target mapping ─────────────────────────────────────────────────────
const ENTITY_VAR_TARGET: Record<string, string> = {
  persone: 'persona',
  nodi: 'nodo',
  'strutture-tns': 'struttura_tns',
}

// ─── Bulk Edit sub-tab ─────────────────────────────────────────────────────
function BulkEditTab() {
  const { persone, nodi, struttureTns, variabiliDef, variabiliValori, showToast, refreshPersone, refreshNodi, refreshStruttureTns, refreshVariabiliValori } = useHRStore()
  const [entityType, setEntityType] = useState<'persone' | 'nodi' | 'strutture-tns'>('persone')
  const [selected, setSelected] = useState<string[]>([])
  const [field, setField] = useState('')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [applyConfirm, setApplyConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const gridRef = useRef<AgGridReact>(null)

  const varTarget = ENTITY_VAR_TARGET[entityType]
  const compatibleVars = variabiliDef.filter(v => v.target === 'tutti' || v.target === varTarget)

  const baseRows = entityType === 'persone' ? persone.filter(p => !p.deleted_at) : entityType === 'nodi' ? nodi.filter(n => !n.deleted_at) : struttureTns.filter(s => !s.deleted_at)
  const idField = entityType === 'persone' ? 'cf' : entityType === 'nodi' ? 'id' : 'codice'

  const rowData = React.useMemo(() => {
    const vByKey = new Map<string, Record<string, string>>()
    for (const v of variabiliValori) {
      const key = `${v.entita_tipo}::${v.entita_id}`
      if (!vByKey.has(key)) vByKey.set(key, {})
      vByKey.get(key)![`var_${v.var_id}`] = v.valore ?? ''
    }
    const tipoMap: Record<string, string> = { persone: 'persona', nodi: 'nodo_org', 'strutture-tns': 'struttura_tns' }
    const tipo = tipoMap[entityType]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (baseRows as any[]).map(r => ({ ...r, ...(vByKey.get(`${tipo}::${String(r[idField])}`) ?? {}) }))
  }, [baseRows, variabiliValori, entityType, idField])

  const editableFields = [
    ...BULK_FIELDS[entityType] ?? [],
    ...compatibleVars.map(v => ({ value: `var_${v.id}`, label: v.label })),
  ]

  const colDefs = React.useMemo((): ColDef[] => {
    const base = BASE_COLS[entityType] ?? []
    const varCols: ColDef[] = compatibleVars.map(v => ({
      field: `var_${v.id}`,
      headerName: `⊕ ${v.label}`,
      width: 140,
    }))
    return [...base, ...varCols]
  }, [entityType, compatibleVars])

  useEffect(() => { setField(''); setValue(''); setSelected([]) }, [entityType])

  const getRowId = useCallback((params: { data: Record<string, unknown> }) => String(params.data[idField]), [idField])

  const onSelectionChanged = useCallback((e: SelectionChangedEvent) => {
    const rows = e.api.getSelectedRows() as Record<string, unknown>[]
    setSelected(rows.map(r => String(r[idField])))
  }, [idField])

  const doRefresh = useCallback(async (fieldKey: string) => {
    if (fieldKey.startsWith('var_')) await refreshVariabiliValori()
    else if (entityType === 'persone') await refreshPersone()
    else if (entityType === 'nodi') await refreshNodi()
    else await refreshStruttureTns()
  }, [entityType, refreshPersone, refreshNodi, refreshStruttureTns, refreshVariabiliValori])

  const handleApply = async () => {
    setApplyConfirm(false)
    setLoading(true)
    try {
      const res = await api.dataCleaning.bulkUpdate({ entityType, ids: selected, field, value: value || null })
      await doRefresh(field)
      showToast(`${res.updated} record aggiornati${res.errors.length > 0 ? ` (${res.errors.length} errori)` : ''}`, res.errors.length > 0 ? 'warning' : 'success')
      gridRef.current?.api?.deselectAll()
      setSelected([])
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    setDeleteConfirm(false)
    setLoading(true)
    let ok = 0, fail = 0
    try {
      for (const id of selected) {
        try {
          let r: { success: boolean }
          if (entityType === 'persone') r = await api.persone.delete(id)
          else if (entityType === 'nodi') r = await api.org.delete(id)
          else r = await api.struttureTns.delete(id, true)
          if (r.success) ok++; else fail++
        } catch { fail++ }
      }
      if (entityType === 'persone') await refreshPersone()
      else if (entityType === 'nodi') await refreshNodi()
      else await refreshStruttureTns()
      showToast(`${ok} eliminati${fail > 0 ? `, ${fail} errori` : ''}`, fail > 0 ? 'warning' : 'success')
      gridRef.current?.api?.deselectAll()
      setSelected([])
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 flex-none flex-wrap">
        <div className="flex items-center gap-1.5">
          {(['persone', 'nodi', 'strutture-tns'] as const).map(e => (
            <button key={e} onClick={() => setEntityType(e)}
              className={['px-3 py-1 text-xs rounded transition-colors', entityType === e ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'].join(' ')}>
              {e === 'persone' ? 'Persone' : e === 'nodi' ? 'Nodi' : 'Strutture TNS'}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-600">{rowData.length} record</span>

        <div className="flex-1" />

        {selected.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-indigo-400 font-medium">{selected.length} selezionati</span>

            {/* Modifica massiva */}
            <select value={field} onChange={e => setField(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-slate-300 text-xs px-2 py-1 rounded">
              <option value="">— campo —</option>
              {editableFields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <input type="text" placeholder="Nuovo valore" value={value} onChange={e => setValue(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-slate-300 text-xs px-2 py-1 rounded w-36" />
            <button onClick={() => setApplyConfirm(true)} disabled={!field || loading}
              className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50">
              {loading ? 'Applico…' : `Applica a ${selected.length}`}
            </button>

            {/* Separatore */}
            <span className="w-px h-5 bg-slate-700" />

            {/* Elimina massivo */}
            <button onClick={() => setDeleteConfirm(true)} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1 text-xs bg-red-900/40 hover:bg-red-900/70 text-red-300 border border-red-800 rounded transition-colors disabled:opacity-50">
              <Trash2 className="w-3 h-3" />
              Elimina {selected.length}
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 ag-theme-alpine-dark">
        <AgGridReact
          ref={gridRef}
          rowData={rowData as unknown as Record<string, unknown>[]}
          columnDefs={colDefs}
          getRowId={getRowId}
          rowSelection="multiple"
          onSelectionChanged={onSelectionChanged}
          suppressRowClickSelection={false}
          defaultColDef={{ resizable: true, sortable: true, filter: true }}
          headerHeight={32}
          rowHeight={28}
        />
      </div>

      {/* Conferma modifica massiva */}
      {applyConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-5 max-w-sm w-full shadow-xl">
            <h3 className="text-sm font-semibold text-slate-200 mb-2">Conferma modifica massiva</h3>
            <p className="text-sm text-slate-400 mb-1">
              Impostare <span className="font-mono text-slate-200 bg-slate-700 px-1 rounded">{editableFields.find(f => f.value === field)?.label ?? field}</span> a{' '}
              <span className="font-mono text-indigo-300">{value || '(vuoto)'}</span>
            </p>
            <p className="text-sm text-slate-400 mb-4">su <span className="text-slate-100 font-medium">{selected.length} record</span>?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setApplyConfirm(false)} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 border border-slate-600 rounded-md">Annulla</button>
              <button onClick={handleApply} className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md">Applica</button>
            </div>
          </div>
        </div>
      )}

      {/* Conferma eliminazione massiva */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-slate-800 border border-red-800 rounded-lg p-5 max-w-sm w-full shadow-xl">
            <h3 className="text-sm font-semibold text-red-300 mb-2">Conferma eliminazione</h3>
            <p className="text-sm text-slate-400 mb-1">
              Stai per eliminare <span className="text-slate-100 font-medium">{selected.length} record</span> di tipo{' '}
              <span className="text-slate-100 font-medium">{entityType}</span>.
            </p>
            <p className="text-xs text-slate-500 mb-4">
              {entityType !== 'strutture-tns'
                ? 'I record saranno marcati come eliminati (soft delete) e non appariranno nelle viste.'
                : 'Le strutture verranno eliminate anche se hanno figli o persone assegnate.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteConfirm(false)} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 border border-slate-600 rounded-md">Annulla</button>
              <button onClick={handleBulkDelete} className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded-md">Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Merge manuale sub-tab ─────────────────────────────────────────────────
function MergeTab() {
  const { persone, nodi, struttureTns, showToast, refreshPersone, refreshNodi, refreshStruttureTns } = useHRStore()
  const [entityType, setEntityType] = useState<'persone' | 'nodi' | 'strutture-tns'>('persone')
  const [survivorId, setSurvivorId] = useState('')
  const [victimId, setVictimId] = useState('')
  const [overrides, setOverrides] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)

  const options = React.useMemo(() => {
    if (entityType === 'persone') return persone.filter(p => !p.deleted_at).map(p => ({ id: String(p.cf), label: `${p.cognome ?? ''} ${p.nome ?? ''} (${p.cf})` }))
    if (entityType === 'nodi') return nodi.filter(n => !n.deleted_at).map(n => ({ id: String(n.id), label: `${n.nome_uo ?? n.id}` }))
    return struttureTns.map(s => ({ id: String(s.codice), label: `${s.nome ?? s.codice} (${s.codice})` }))
  }, [entityType, persone, nodi, struttureTns])

  const survivorRecord = options.find(o => o.id === survivorId)
  const victimRecord = options.find(o => o.id === victimId)

  const getSurvivorData = () => {
    if (entityType === 'persone') return persone.find(p => p.cf === survivorId) as Record<string, unknown> | undefined
    if (entityType === 'nodi') return nodi.find(n => n.id === survivorId) as Record<string, unknown> | undefined
    return struttureTns.find(s => s.codice === survivorId) as Record<string, unknown> | undefined
  }
  const getVictimData = () => {
    if (entityType === 'persone') return persone.find(p => p.cf === victimId) as Record<string, unknown> | undefined
    if (entityType === 'nodi') return nodi.find(n => n.id === victimId) as Record<string, unknown> | undefined
    return struttureTns.find(s => s.codice === victimId) as Record<string, unknown> | undefined
  }

  const survivorData = getSurvivorData()
  const victimData = getVictimData()

  const diffFields = React.useMemo(() => {
    if (!survivorData || !victimData) return []
    const keys = new Set([...Object.keys(survivorData), ...Object.keys(victimData)])
    const skip = new Set(['deleted_at', 'created_at', 'updated_at', 'ultimo_aggiornamento', 'extra_data'])
    return [...keys].filter(k => !skip.has(k) && survivorData[k] !== victimData[k])
  }, [survivorData, victimData])

  const handleMerge = async () => {
    if (!survivorId || !victimId) return
    if (!confirm(`Unire "${victimRecord?.label}" nel "${survivorRecord?.label}"? Questa azione non è reversibile.`)) return
    setLoading(true)
    try {
      await api.dataCleaning.merge({ entityType, survivorId, victimId, overrideFields: overrides })
      if (entityType === 'persone') await refreshPersone()
      else if (entityType === 'nodi') await refreshNodi()
      else await refreshStruttureTns()
      showToast('Merge completato', 'success')
      setSurvivorId(''); setVictimId(''); setOverrides({})
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* Entity selector */}
      <div className="flex gap-2">
        {(['persone', 'nodi', 'strutture-tns'] as const).map(e => (
          <button
            key={e}
            onClick={() => { setEntityType(e); setSurvivorId(''); setVictimId(''); setOverrides({}) }}
            className={[
              'px-3 py-1 text-xs rounded transition-colors',
              entityType === e ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            ].join(' ')}
          >
            {e === 'persone' ? 'Persone' : e === 'nodi' ? 'Nodi' : 'Strutture TNS'}
          </button>
        ))}
      </div>

      {/* Record selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Survivor (da mantenere)</label>
          <select
            value={survivorId}
            onChange={e => setSurvivorId(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 text-slate-300 text-sm px-2 py-1.5 rounded"
          >
            <option value="">— seleziona —</option>
            {options.filter(o => o.id !== victimId).map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">Victim (da eliminare)</label>
          <select
            value={victimId}
            onChange={e => setVictimId(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 text-slate-300 text-sm px-2 py-1.5 rounded"
          >
            <option value="">— seleziona —</option>
            {options.filter(o => o.id !== survivorId).map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Diff preview */}
      {survivorData && victimData && diffFields.length > 0 && (
        <div>
          <p className="text-xs text-slate-400 mb-2 uppercase tracking-wide">Campi con differenze — seleziona quale valore usare nel survivor</p>
          <div className="border border-slate-700 rounded-lg overflow-hidden">
            <div className="grid grid-cols-3 gap-0 px-3 py-1.5 bg-slate-800 text-xs text-slate-400 font-medium border-b border-slate-700">
              <span>Campo</span>
              <span>Survivor</span>
              <span>Victim</span>
            </div>
            {diffFields.map(field => {
              const sv = survivorData[field]
              const vv = victimData[field]
              const useVictim = overrides[field] !== undefined
              return (
                <div key={field} className="grid grid-cols-3 gap-0 px-3 py-1.5 border-b border-slate-700/50 hover:bg-slate-800/50 text-sm">
                  <span className="text-xs text-slate-500 self-center">{field}</span>
                  <button
                    onClick={() => {
                      const n = { ...overrides }
                      delete n[field]
                      setOverrides(n)
                    }}
                    className={`text-left text-xs px-1.5 py-0.5 rounded transition-colors ${!useVictim ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {sv === null || sv === '' ? <span className="text-slate-600 italic">null</span> : String(sv)}
                  </button>
                  <button
                    onClick={() => setOverrides({ ...overrides, [field]: vv })}
                    className={`text-left text-xs px-1.5 py-0.5 rounded transition-colors ${useVictim ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {vv === null || vv === '' ? <span className="text-slate-600 italic">null</span> : String(vv)}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {survivorId && victimId && (
        <button
          onClick={handleMerge}
          disabled={loading}
          className="self-start px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50"
        >
          {loading ? 'Merge in corso…' : 'Esegui merge'}
        </button>
      )}
    </div>
  )
}

// ─── Main view ─────────────────────────────────────────────────────────────
export default function DataCleaningView() {
  const { activeView, setActiveView } = useHRStore()
  const subTab = (activeView === 'dc-duplicati' || activeView === 'dc-bulk-edit' || activeView === 'dc-merge')
    ? activeView
    : 'dc-duplicati'

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'dc-duplicati', label: 'Proposte' },
    { id: 'dc-bulk-edit', label: 'Modifica Massiva' },
    { id: 'dc-merge', label: 'Unisci Record' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tabs */}
      <div className="flex-none flex items-center gap-0 px-4 pt-2 border-b border-slate-700 bg-slate-900">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveView(t.id)}
            className={[
              'px-4 py-2 text-sm border-b-2 transition-colors -mb-px',
              subTab === t.id
                ? 'border-indigo-500 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {subTab === 'dc-duplicati' && <ProposteTab />}
        {subTab === 'dc-bulk-edit' && <BulkEditTab />}
        {subTab === 'dc-merge' && <MergeTab />}
      </div>
    </div>
  )
}
