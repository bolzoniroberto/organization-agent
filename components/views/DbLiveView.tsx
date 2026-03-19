'use client'
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import { Search, RefreshCw, DatabaseBackup, RotateCcw, Trash2, Clock, CheckCircle, AlertTriangle } from 'lucide-react'

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
  const [backing, setBacking] = useState(false)
  const [backups, setBackups] = useState<{ name: string; sizeKb: number; createdAt: string }[]>([])
  const [showBackups, setShowBackups] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [restoreStatus, setRestoreStatus] = useState<{ ok: boolean; msg: string } | null>(null)
  const [restoring, setRestoring] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshAll()
    setRefreshing(false)
  }

  const loadBackups = useCallback(async () => {
    const res = await api.db.listBackups()
    setBackups(res.backups)
  }, [])

  useEffect(() => {
    if (showBackups) loadBackups()
  }, [showBackups, loadBackups])

  const handleBackup = async () => {
    setBacking(true)
    try {
      const res = await api.db.backup()
      if (res.success) {
        await loadBackups()
        setShowBackups(true)
      }
    } finally {
      setBacking(false)
    }
  }

  const handleRestore = async (filename: string) => {
    setConfirmRestore(null)
    setRestoring(true)
    setRestoreStatus(null)
    try {
      const res = await api.db.restore(filename)
      if (res.success) {
        setRestoreStatus({ ok: true, msg: `Ripristinato. Safety backup: ${res.safetyBackup}. Ricarica la pagina per vedere i dati aggiornati.` })
        await loadBackups()
      } else {
        setRestoreStatus({ ok: false, msg: res.error ?? 'Errore ripristino' })
      }
    } catch (e) {
      setRestoreStatus({ ok: false, msg: String(e) })
    } finally {
      setRestoring(false)
    }
  }

  const handleDeleteBackup = async (filename: string) => {
    setConfirmDelete(null)
    await api.db.deleteBackup(filename)
    await loadBackups()
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatBackupName = (name: string) => {
    // hrplatform_2026-03-19T10-30-00.db → data leggibile
    const m = name.match(/hrplatform_(?:prerestore_)?(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/)
    if (m) return `${m[1]} ${m[2]}:${m[3]}`
    return name.replace('hrplatform_', '').replace('.db', '')
  }

  const isPreRestore = (name: string) => name.includes('prerestore')

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
          onClick={() => setShowBackups(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
            showBackups ? 'border-indigo-600 text-indigo-300 bg-indigo-950/40' : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500'
          }`}
        >
          <DatabaseBackup className="w-3 h-3" />
          Backup
          {backups.length > 0 && <span className="text-slate-500">({backups.length})</span>}
        </button>

        <button
          onClick={handleBackup}
          disabled={backing}
          className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 px-2 py-1 rounded border border-green-800 hover:border-green-600 transition-colors disabled:opacity-40"
          title="Crea backup ora"
        >
          {backing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <DatabaseBackup className="w-3 h-3" />}
          {backing ? 'Salvataggio…' : 'Salva versione'}
        </button>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-600 hover:border-slate-500 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          Ricarica
        </button>
      </div>

      {restoreStatus && (
        <div className={`flex-none px-4 py-2 border-b flex items-start gap-2 ${restoreStatus.ok ? 'bg-green-950/40 border-green-800' : 'bg-red-950/40 border-red-800'}`}>
          {restoreStatus.ok ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
          <span className="text-xs text-slate-200">{restoreStatus.msg}</span>
          {restoreStatus.ok && (
            <button onClick={() => window.location.reload()} className="ml-2 text-xs text-green-300 underline hover:text-green-200 flex-shrink-0">Ricarica ora</button>
          )}
          <button onClick={() => setRestoreStatus(null)} className="ml-auto text-slate-500 hover:text-slate-300 text-xs">✕</button>
        </div>
      )}

      {showBackups && (
        <div className="flex-none px-4 py-3 bg-slate-900 border-b border-slate-700 max-h-64 overflow-y-auto">
          {backups.length === 0 ? (
            <p className="text-xs text-slate-500">Nessun backup disponibile. Clicca "Salva versione" per creare il primo.</p>
          ) : (
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3 h-3 text-slate-500" />
                <span className="text-xs text-slate-500">Auto-backup dopo ogni modifica · {backups.length} versioni salvate</span>
              </div>
              {backups.map(b => (
                <div key={b.name} className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs ${isPreRestore(b.name) ? 'bg-amber-950/30 border-amber-800/50' : 'bg-slate-800 border-slate-700'}`}>
                  <span className={`font-medium ${isPreRestore(b.name) ? 'text-amber-300' : 'text-slate-200'}`}>
                    {isPreRestore(b.name) && <span className="text-amber-500 mr-1">[pre-restore]</span>}
                    {formatBackupName(b.name)}
                  </span>
                  <span className="text-slate-500">{b.sizeKb} KB</span>
                  <span className="text-slate-600 ml-auto">{formatDate(b.createdAt)}</span>
                  <button
                    onClick={() => setConfirmRestore(b.name)}
                    disabled={restoring}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-xs text-indigo-300 hover:text-indigo-200 border border-indigo-800 hover:border-indigo-600 rounded transition-colors disabled:opacity-40"
                    title="Ripristina questa versione"
                  >
                    <RotateCcw className="w-3 h-3" /> Ripristina
                  </button>
                  <button
                    onClick={() => setConfirmDelete(b.name)}
                    className="p-0.5 text-slate-600 hover:text-red-400 transition-colors"
                    title="Elimina backup"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {confirmRestore && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setConfirmRestore(null)}>
          <div className="bg-slate-800 border border-indigo-700 rounded-lg p-5 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-indigo-300 mb-2">Ripristina versione</h3>
            <p className="text-sm text-slate-300 mb-1">Vuoi ripristinare:</p>
            <p className="text-sm font-mono text-slate-100 mb-3">{formatBackupName(confirmRestore)}</p>
            <p className="text-xs text-slate-500 mb-4">Il DB attuale verrà salvato automaticamente come backup pre-restore prima di procedere.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRestore(null)} className="px-3 py-1.5 text-sm text-slate-400 border border-slate-600 rounded-md hover:text-slate-200">Annulla</button>
              <button onClick={() => handleRestore(confirmRestore)} className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">Ripristina</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setConfirmDelete(null)}>
          <div className="bg-slate-800 border border-red-700 rounded-lg p-5 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-red-300 mb-2">Elimina backup</h3>
            <p className="text-sm text-slate-300 mb-3">Eliminare <span className="font-mono text-slate-100">{formatBackupName(confirmDelete)}</span>? L'operazione è irreversibile.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-sm text-slate-400 border border-slate-600 rounded-md hover:text-slate-200">Annulla</button>
              <button onClick={() => handleDeleteBackup(confirmDelete)} className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded-md">Elimina</button>
            </div>
          </div>
        </div>
      )}

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
