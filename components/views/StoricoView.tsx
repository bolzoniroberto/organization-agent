'use client'
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Download, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import type { ChangeLogEntry } from '@/types'
import { api } from '@/lib/api'
import { useHRStore } from '@/store/useHRStore'

const ACTION_BADGE: Record<string, string> = {
  CREATE: 'bg-green-900/50 text-green-300',
  UPDATE: 'bg-blue-900/50 text-blue-300',
  DELETE: 'bg-red-900/50 text-red-300',
  RESTORE: 'bg-amber-900/50 text-amber-300',
  IMPORT: 'bg-purple-900/50 text-purple-300',
  EXPORT: 'bg-slate-700 text-slate-300',
  AGENT_SUGGEST: 'bg-indigo-900/50 text-indigo-300',
}

interface GroupedEntry {
  key: string
  timestamp: string
  entity_type: string
  entity_id: string
  entity_label: string | null
  action: string
  entries: ChangeLogEntry[]
}

function groupChangelog(entries: ChangeLogEntry[]): GroupedEntry[] {
  const groups = new Map<string, GroupedEntry>()
  for (const entry of entries) {
    const minute = entry.timestamp?.slice(0, 16) ?? ''
    const key = `${minute}|${entry.entity_id}|${entry.action}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        timestamp: entry.timestamp,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        entity_label: entry.entity_label,
        action: entry.action,
        entries: [],
      })
    }
    groups.get(key)!.entries.push(entry)
  }
  return Array.from(groups.values())
}

function formatTs(ts: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

export default function StoricoView() {
  const { showToast } = useHRStore()
  const [entries, setEntries] = useState<ChangeLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('all')
  const [action, setAction] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [limit] = useState(500)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.changelog.list({
        search: search || undefined,
        entityType: entityType !== 'all' ? entityType : undefined,
        action: action !== 'all' ? action : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        limit,
      })
      setEntries(data)
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }, [search, entityType, action, dateFrom, dateTo, limit, showToast])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  const grouped = useMemo(() => groupChangelog(entries), [entries])

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleExport = async () => {
    try {
      await api.changelog.exportCsv()
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-700 flex-wrap">
        <input
          type="text"
          placeholder="Cerca..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md w-40 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <select value={entityType} onChange={e => setEntityType(e.target.value)}
          className="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="all">Tutte le entità</option>
          <option value="nodo_org">Nodo Org</option>
          <option value="persona">Persona</option>
          <option value="tns">TNS</option>
          <option value="timesheet">Timesheet</option>
          <option value="variabile">Variabile</option>
          <option value="system">System</option>
        </select>
        <select value={action} onChange={e => setAction(e.target.value)}
          className="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="all">Tutte le azioni</option>
          <option value="CREATE">CREATE</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
          <option value="RESTORE">RESTORE</option>
          <option value="IMPORT">IMPORT</option>
          <option value="EXPORT">EXPORT</option>
          <option value="AGENT_SUGGEST">AGENT_SUGGEST</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        <div className="flex-1" />
        <span className="text-xs text-slate-500">{grouped.length} op · {entries.length} righe</span>
        <button onClick={load} disabled={loading} className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 px-2 py-1.5 hover:bg-slate-800 rounded-md transition-colors">
          <Download className="w-3.5 h-3.5" />
          CSV
        </button>
      </div>

      {/* Grouped list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-24 text-sm text-slate-400">Caricamento...</div>
        )}
        {!loading && grouped.length === 0 && (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
            Nessun evento nel log
          </div>
        )}
        {!loading && grouped.map(group => {
          const isExpanded = expandedKeys.has(group.key)
          const canExpand = group.action === 'UPDATE' && group.entries.length > 1
          return (
            <div key={group.key} className="border-b border-slate-800">
              <div
                className={`flex items-center gap-2 px-4 py-2 hover:bg-slate-900/50 ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
                onClick={() => canExpand && toggleExpand(group.key)}
              >
                <div className="w-4 flex-none">
                  {canExpand && (
                    <span className="text-slate-500">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </span>
                  )}
                </div>
                <span className="text-xs text-slate-500 font-mono w-32 flex-none">{formatTs(group.timestamp)}</span>
                <span className="text-xs text-slate-500 w-20 flex-none">{group.entity_type !== 'system' ? group.entity_type : '—'}</span>
                <span className="text-sm text-slate-200 flex-1 truncate">
                  {group.entity_label ?? group.entity_id}
                  {group.entity_id !== group.entity_label && group.entity_label && (
                    <span className="text-slate-500 text-xs ml-1.5 font-mono">({group.entity_id})</span>
                  )}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-none ${ACTION_BADGE[group.action] ?? 'bg-slate-700 text-slate-300'}`}>
                  {group.action}
                </span>
                <div className="text-xs text-slate-500 w-48 text-right truncate flex-none">
                  {group.action === 'UPDATE' && group.entries.length === 1 && group.entries[0].field_name ? (
                    <span>
                      <span className="text-slate-400">{group.entries[0].field_name}</span>
                      {' '}
                      <span className="line-through text-red-400/70">{group.entries[0].old_value ?? '—'}</span>
                      {' → '}
                      <span className="text-green-400/70">{group.entries[0].new_value ?? '—'}</span>
                    </span>
                  ) : group.action === 'UPDATE' && group.entries.length > 1 ? (
                    <span>{group.entries.length} campi</span>
                  ) : group.entries[0]?.new_value ? (
                    <span className="truncate text-slate-400">{group.entries[0].new_value}</span>
                  ) : null}
                </div>
              </div>
              {isExpanded && (
                <div className="bg-slate-900 border-t border-slate-800 px-4 py-2 space-y-1">
                  <div className="grid grid-cols-3 gap-4 text-xs text-slate-600 font-medium pb-1 border-b border-slate-800">
                    <span>Campo</span><span>Vecchio</span><span>Nuovo</span>
                  </div>
                  {group.entries.map(e => (
                    <div key={e.id} className="grid grid-cols-3 gap-4 text-xs py-0.5">
                      <span className="text-slate-400 font-medium truncate">{e.field_name}</span>
                      <span className="text-red-400/80 truncate">{e.old_value ?? '—'}</span>
                      <span className="text-green-400/80 truncate">{e.new_value ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
