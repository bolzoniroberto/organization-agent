'use client'
import React, { useState, useMemo } from 'react'
import { useHRStore } from '@/store/useHRStore'
import { Search, RefreshCw } from 'lucide-react'

function Panel({
  title, count, color, search, onSearch, children
}: {
  title: string; count: number; color: string; search: string; onSearch: (s: string) => void; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col min-h-0 bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
      <div className={`flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-800 flex-none`}>
        <span className={`text-xs font-semibold uppercase tracking-wider ${color}`}>{title}</span>
        <span className="text-xs text-slate-500 font-mono">{count}</span>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="Cerca…"
            className="pl-6 pr-2 py-0.5 text-xs bg-slate-900 border border-slate-600 rounded text-slate-300 w-36 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

function Table({ cols, rows }: { cols: { key: string; label: string; mono?: boolean }[]; rows: Record<string, unknown>[] }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead className="sticky top-0 bg-slate-800 z-10">
        <tr>
          {cols.map(c => (
            <th key={c.key} className="px-2 py-1 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/60">
            {cols.map(c => (
              <td key={c.key} className={`px-2 py-0.5 truncate max-w-[180px] ${c.mono ? 'font-mono text-slate-400' : 'text-slate-300'}`} title={String(r[c.key] ?? '')}>
                {String(r[c.key] ?? '')}
              </td>
            ))}
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={cols.length} className="px-2 py-4 text-center text-slate-600">Nessun risultato</td></tr>
        )}
      </tbody>
    </table>
  )
}

export default function DbLiveView() {
  const { nodi, persone, struttureTns, refreshAll } = useHRStore()
  const tns = persone.filter(p => p.codice_tns != null)
  const [s1, setS1] = useState('')
  const [s2, setS2] = useState('')
  const [s3, setS3] = useState('')
  const [s4, setS4] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshAll()
    setRefreshing(false)
  }

  const fNodi = useMemo(() => {
    const q = s1.toLowerCase()
    return nodi.filter(n => !n.deleted_at && (!q || [n.id, n.nome_uo, n.cf_persona, n.tipo_nodo, n.centro_costo].some(v => v?.toLowerCase().includes(q))))
  }, [nodi, s1])

  const fPersone = useMemo(() => {
    const q = s2.toLowerCase()
    return persone.filter(p => !p.deleted_at && (!q || [p.cf, p.cognome, p.nome, p.email, p.societa, p.area].some(v => v?.toLowerCase().includes(q))))
  }, [persone, s2])

  const fTns = useMemo(() => {
    const q = s3.toLowerCase()
    return tns.filter(t => !q || [t.cf, t.codice_tns, t.titolare_tns, t.sede_tns].some(v => v?.toLowerCase().includes(q)))
  }, [tns, s3])

  const fStrutt = useMemo(() => {
    const q = s4.toLowerCase()
    return struttureTns.filter(s => !q || [s.codice, s.nome, s.padre, s.tipo].some(v => v?.toLowerCase().includes(q)))
  }, [struttureTns, s4])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 flex-none">
        <span className="text-sm font-semibold text-slate-200">DB Live</span>
        <span className="text-xs text-slate-500">vista di controllo — sola lettura</span>
        <div className="flex-1" />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-600 hover:border-slate-500 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          Ricarica
        </button>
      </div>

      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2 p-2 min-h-0 overflow-hidden">
        <Panel title="Nodi Organigramma" count={fNodi.length} color="text-slate-300" search={s1} onSearch={setS1}>
          <Table
            cols={[
              { key: 'id', label: 'ID', mono: true },
              { key: 'tipo_nodo', label: 'Tipo' },
              { key: 'nome_uo', label: 'Nome UO' },
              { key: 'cf_persona', label: 'CF', mono: true },
              { key: 'reports_to', label: 'Parent', mono: true },
              { key: 'centro_costo', label: 'CdC', mono: true },
            ]}
            rows={fNodi as unknown as Record<string, unknown>[]}
          />
        </Panel>

        <Panel title="Persone" count={fPersone.length} color="text-indigo-300" search={s2} onSearch={setS2}>
          <Table
            cols={[
              { key: 'cf', label: 'CF', mono: true },
              { key: 'cognome', label: 'Cognome' },
              { key: 'nome', label: 'Nome' },
              { key: 'societa', label: 'Società' },
              { key: 'area', label: 'Area' },
              { key: 'qualifica', label: 'Qualifica' },
            ]}
            rows={fPersone as unknown as Record<string, unknown>[]}
          />
        </Panel>

        <Panel title="Ruoli TNS" count={fTns.length} color="text-green-300" search={s3} onSearch={setS3}>
          <Table
            cols={[
              { key: 'cf', label: 'CF', mono: true },
              { key: 'codice_tns', label: 'Codice', mono: true },
              { key: 'padre_tns', label: 'Padre', mono: true },
              { key: 'livello_tns', label: 'Liv.' },
              { key: 'titolare_tns', label: 'Titolare' },
              { key: 'sede_tns', label: 'Sede' },
            ]}
            rows={fTns as unknown as Record<string, unknown>[]}
          />
        </Panel>

        <Panel title="Strutture TNS" count={fStrutt.length} color="text-amber-300" search={s4} onSearch={setS4}>
          <Table
            cols={[
              { key: 'codice', label: 'Codice', mono: true },
              { key: 'nome', label: 'Nome' },
              { key: 'padre', label: 'Padre', mono: true },
              { key: 'livello', label: 'Liv.' },
              { key: 'tipo', label: 'Tipo' },
            ]}
            rows={fStrutt as unknown as Record<string, unknown>[]}
          />
        </Panel>
      </div>
    </div>
  )
}
