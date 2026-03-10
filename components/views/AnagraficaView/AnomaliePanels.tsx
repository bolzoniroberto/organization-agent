'use client'
import React, { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react'
import type { NodoOrganigramma, Persona } from '@/types'
import { useHRStore } from '@/store/useHRStore'

interface AnomalieData {
  orfani: NodoOrganigramma[]
  strutture_vuote: NodoOrganigramma[]
  persone_senza_nodo: Persona[]
}

interface PanelProps {
  title: string
  count: number
  color: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Panel({ title, count, color, expanded, onToggle, children }: PanelProps) {
  return (
    <div className={`border rounded-lg ${color}`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown className="w-4 h-4 flex-none" /> : <ChevronRight className="w-4 h-4 flex-none" />}
        <AlertTriangle className="w-4 h-4 flex-none" />
        <span className="text-sm font-medium flex-1">{title}</span>
        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-current/10">{count}</span>
      </button>
      {expanded && (
        <div className="border-t border-current/20 px-4 pb-3 pt-2 overflow-x-auto">
          {children}
        </div>
      )}
    </div>
  )
}

function NodoTable({ nodi }: { nodi: NodoOrganigramma[] }) {
  if (nodi.length === 0) return <p className="text-xs text-slate-500 py-2">Nessuna anomalia</p>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-slate-500">
          <th className="text-left py-1 pr-4 font-medium">ID</th>
          <th className="text-left py-1 pr-4 font-medium">Tipo</th>
          <th className="text-left py-1 pr-4 font-medium">Nome UO</th>
          <th className="text-left py-1 pr-4 font-medium">Reports To</th>
          <th className="text-left py-1 font-medium">CF Persona</th>
        </tr>
      </thead>
      <tbody>
        {nodi.map(n => (
          <tr key={n.id} className="border-t border-slate-700">
            <td className="py-1 pr-4 font-mono text-slate-300">{n.id}</td>
            <td className="py-1 pr-4 text-slate-400">{n.tipo_nodo}</td>
            <td className="py-1 pr-4 text-slate-300">{n.nome_uo ?? '—'}</td>
            <td className="py-1 pr-4 font-mono text-slate-400">{n.reports_to ?? '—'}</td>
            <td className="py-1 font-mono text-slate-400">{n.cf_persona ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PersoneTable({ persone }: { persone: Persona[] }) {
  if (persone.length === 0) return <p className="text-xs text-slate-500 py-2">Nessuna anomalia</p>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-slate-500">
          <th className="text-left py-1 pr-4 font-medium">CF</th>
          <th className="text-left py-1 pr-4 font-medium">Cognome</th>
          <th className="text-left py-1 pr-4 font-medium">Nome</th>
          <th className="text-left py-1 font-medium">Società</th>
        </tr>
      </thead>
      <tbody>
        {persone.map(p => (
          <tr key={p.cf} className="border-t border-slate-700">
            <td className="py-1 pr-4 font-mono text-slate-300">{p.cf}</td>
            <td className="py-1 pr-4 text-slate-300">{p.cognome ?? '—'}</td>
            <td className="py-1 pr-4 text-slate-300">{p.nome ?? '—'}</td>
            <td className="py-1 text-slate-400">{p.societa ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AnomaliePanels() {
  const [data, setData] = useState<AnomalieData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ orfani: true, strutture_vuote: false, persone_senza_nodo: false })
  const { showToast } = useHRStore()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/org/anomalie')
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <div className="flex flex-col gap-4 p-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Rilevamento Anomalie</h3>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Aggiorna
        </button>
      </div>

      {!data && !loading && <p className="text-sm text-slate-500">Caricamento anomalie...</p>}

      {data && (
        <div className="space-y-3">
          <Panel
            title="Nodi Orfani"
            count={data.orfani.length}
            color={data.orfani.length > 0 ? 'border-amber-700 text-amber-300' : 'border-slate-700 text-slate-400'}
            expanded={expanded.orfani}
            onToggle={() => toggle('orfani')}
          >
            <p className="text-xs text-slate-500 mb-2">Nodi con <code className="font-mono">reports_to</code> che punta a un genitore inesistente.</p>
            <NodoTable nodi={data.orfani} />
          </Panel>

          <Panel
            title="Strutture Vuote"
            count={data.strutture_vuote.length}
            color={data.strutture_vuote.length > 0 ? 'border-orange-700 text-orange-300' : 'border-slate-700 text-slate-400'}
            expanded={expanded.strutture_vuote}
            onToggle={() => toggle('strutture_vuote')}
          >
            <p className="text-xs text-slate-500 mb-2">Nodi STRUTTURA senza figli e senza persona assegnata.</p>
            <NodoTable nodi={data.strutture_vuote} />
          </Panel>

          <Panel
            title="Persone Senza Nodo"
            count={data.persone_senza_nodo.length}
            color={data.persone_senza_nodo.length > 0 ? 'border-red-700 text-red-300' : 'border-slate-700 text-slate-400'}
            expanded={expanded.persone_senza_nodo}
            onToggle={() => toggle('persone_senza_nodo')}
          >
            <p className="text-xs text-slate-500 mb-2">Persone non assegnate ad alcun nodo organigramma.</p>
            <PersoneTable persone={data.persone_senza_nodo} />
          </Panel>
        </div>
      )}
    </div>
  )
}
