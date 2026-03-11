'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, SelectionChangedEvent } from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-alpine.css'
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, AlertCircle, Info } from 'lucide-react'
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

// ─── Bulk edit column configs ──────────────────────────────────────────────
const BULK_FIELDS: Record<string, { value: string; label: string }[]> = {
  persone: [
    { value: 'area', label: 'Area' },
    { value: 'sotto_area', label: 'Sotto Area' },
    { value: 'societa', label: 'Società' },
    { value: 'sede', label: 'Sede' },
    { value: 'tipo_contratto', label: 'Tipo Contratto' },
    { value: 'qualifica', label: 'Qualifica' },
    { value: 'livello', label: 'Livello' },
    { value: 'modalita_presenze', label: 'Modalità Presenze' },
    { value: 'cdc_amministrativo', label: 'CdC Amm.' },
    { value: 'email', label: 'Email' },
  ],
  nodi: [
    { value: 'nome_uo', label: 'Nome UO' },
    { value: 'funzione', label: 'Funzione' },
    { value: 'processo', label: 'Processo' },
    { value: 'sede', label: 'Sede' },
    { value: 'societa_org', label: 'Società Org' },
    { value: 'tipo_collab', label: 'Tipo Collab' },
    { value: 'job_title', label: 'Job Title' },
    { value: 'centro_costo', label: 'Centro Costo' },
  ],
  'strutture-tns': [
    { value: 'nome', label: 'Nome' },
    { value: 'livello', label: 'Livello' },
    { value: 'tipo', label: 'Tipo' },
    { value: 'descrizione', label: 'Descrizione' },
    { value: 'cdc', label: 'CdC' },
    { value: 'sede_tns', label: 'Sede TNS' },
  ],
}

// ─── Bulk Edit sub-tab ─────────────────────────────────────────────────────
function BulkEditTab() {
  const { persone, nodi, struttureTns, showToast, refreshPersone, refreshNodi, refreshStruttureTns } = useHRStore()
  const [entityType, setEntityType] = useState<'persone' | 'nodi' | 'strutture-tns'>('persone')
  const [selected, setSelected] = useState<string[]>([])
  const [field, setField] = useState('')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const gridRef = useRef<AgGridReact>(null)

  const rowData = entityType === 'persone' ? persone : entityType === 'nodi' ? nodi : struttureTns
  const fields = BULK_FIELDS[entityType] ?? []

  // Reset field when entity changes
  useEffect(() => { setField(''); setSelected([]) }, [entityType])

  const colDefs = React.useMemo((): ColDef[] => {
    if (entityType === 'persone') return [
      { field: 'cf', headerName: 'CF', width: 140 },
      { field: 'cognome', headerName: 'Cognome', width: 140 },
      { field: 'nome', headerName: 'Nome', width: 120 },
      { field: 'area', headerName: 'Area', width: 130 },
      { field: 'societa', headerName: 'Società', width: 130 },
      { field: 'sede', headerName: 'Sede', width: 110 },
      { field: 'qualifica', headerName: 'Qualifica', width: 130 },
    ]
    if (entityType === 'nodi') return [
      { field: 'id', headerName: 'ID', width: 200 },
      { field: 'nome_uo', headerName: 'Nome UO', flex: 1 },
      { field: 'funzione', headerName: 'Funzione', width: 140 },
      { field: 'sede', headerName: 'Sede', width: 110 },
      { field: 'societa_org', headerName: 'Società', width: 130 },
    ]
    return [
      { field: 'codice', headerName: 'Codice', width: 130 },
      { field: 'nome', headerName: 'Nome', flex: 1 },
      { field: 'livello', headerName: 'Livello', width: 100 },
      { field: 'tipo', headerName: 'Tipo', width: 110 },
    ]
  }, [entityType])

  const getRowId = useCallback((params: { data: Record<string, unknown> }) => {
    if (entityType === 'persone') return String(params.data.cf)
    if (entityType === 'nodi') return String(params.data.id)
    return String(params.data.codice)
  }, [entityType])

  const onSelectionChanged = useCallback((e: SelectionChangedEvent) => {
    const rows = e.api.getSelectedRows() as Record<string, unknown>[]
    setSelected(rows.map(r => entityType === 'persone' ? String(r.cf) : entityType === 'nodi' ? String(r.id) : String(r.codice)))
  }, [entityType])

  const handleApply = async () => {
    if (!field || selected.length === 0) return
    if (!confirm(`Aggiornare "${field}" su ${selected.length} record?`)) return
    setLoading(true)
    try {
      const res = await api.dataCleaning.bulkUpdate({ entityType, ids: selected, field, value: value || null })
      if (entityType === 'persone') await refreshPersone()
      else if (entityType === 'nodi') await refreshNodi()
      else await refreshStruttureTns()
      showToast(`${res.updated} record aggiornati${res.errors.length > 0 ? ` (${res.errors.length} errori)` : ''}`, res.errors.length > 0 ? 'warning' : 'success')
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
            <button
              key={e}
              onClick={() => setEntityType(e)}
              className={[
                'px-3 py-1 text-xs rounded transition-colors',
                entityType === e ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              ].join(' ')}
            >
              {e === 'persone' ? 'Persone' : e === 'nodi' ? 'Nodi' : 'Strutture TNS'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {selected.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{selected.length} selezionati</span>
            <select
              value={field}
              onChange={e => setField(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-slate-300 text-xs px-2 py-1 rounded"
            >
              <option value="">— campo —</option>
              {fields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <input
              type="text"
              placeholder="Nuovo valore"
              value={value}
              onChange={e => setValue(e.target.value)}
              className="bg-slate-700 border border-slate-600 text-slate-300 text-xs px-2 py-1 rounded w-40"
            />
            <button
              onClick={handleApply}
              disabled={!field || loading}
              className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Applico…' : `Applica a ${selected.length}`}
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
