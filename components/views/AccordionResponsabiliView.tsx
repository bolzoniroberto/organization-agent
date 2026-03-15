'use client'
import React, { useState, useMemo } from 'react'
import { Search, ChevronDown, Users } from 'lucide-react'
import * as Accordion from '@radix-ui/react-accordion'
import { useHRStore } from '@/store/useHRStore'
import type { Persona, SupervisioneTimesheet } from '@/types'
import RecordDrawer from '@/components/shared/RecordDrawer'
import { api } from '@/lib/api'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

interface PendingReassign {
  cf_dipendente: string
  dipendente_label: string
  from_cf_supervisore: string | null
  to_cf_supervisore: string
  to_label: string
}

function personLabel(p: Persona | undefined, cf: string): string {
  if (!p) return cf
  const name = [p.cognome, p.nome].filter(Boolean).join(' ')
  return name || cf
}

function SubItem({
  record,
  persona,
  onOpenPersona,
}: {
  record: SupervisioneTimesheet
  persona: Persona | undefined
  onOpenPersona: (p: Persona) => void
}) {
  const label = personLabel(persona, record.cf_dipendente)
  return (
    <div className="flex items-center justify-between px-3 py-2 hover:bg-slate-800/50 rounded-md transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-slate-200 truncate">{label}</span>
        <span className="text-xs text-slate-500 font-mono flex-shrink-0">{record.cf_dipendente}</span>
        {persona?.qualifica && (
          <span className="text-xs text-slate-600 hidden md:inline truncate">{persona.qualifica}</span>
        )}
      </div>
      {persona && (
        <button
          onClick={() => onOpenPersona(persona)}
          className="text-xs px-2 py-1 text-indigo-400 hover:bg-indigo-900/30 rounded transition-colors flex-shrink-0 ml-2"
        >
          Apri
        </button>
      )}
    </div>
  )
}

export default function AccordionResponsabiliView() {
  const { timesheet, persone, refreshTimesheet, showToast } = useHRStore()
  const [search, setSearch] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<Persona | null>(null)
  const [pendingReassign, setPendingReassign] = useState<PendingReassign | null>(null)

  const personaMap = useMemo(() => {
    const m = new Map<string, Persona>()
    persone.forEach(p => m.set(p.cf, p))
    return m
  }, [persone])

  // Group records by cf_supervisore (only active records, exclude null supervisore unless no other)
  const groups = useMemo(() => {
    const bySuper = new Map<string, SupervisioneTimesheet[]>()
    const supervisorsSet = new Set<string>()

    timesheet.forEach(r => {
      if (r.cf_supervisore) supervisorsSet.add(r.cf_supervisore)
    })

    timesheet.forEach(r => {
      if (!r.cf_supervisore) return
      const list = bySuper.get(r.cf_supervisore) ?? []
      list.push(r)
      bySuper.set(r.cf_supervisore, list)
    })

    return Array.from(bySuper.entries())
      .map(([cf, records]) => ({
        cf,
        persona: personaMap.get(cf),
        records,
        label: personLabel(personaMap.get(cf), cf),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [timesheet, personaMap])

  const filtered = useMemo(() => {
    if (!search.trim()) return groups
    const lower = search.toLowerCase()
    return groups.filter(g =>
      g.label.toLowerCase().includes(lower) ||
      g.cf.toLowerCase().includes(lower) ||
      g.records.some(r => {
        const p = personaMap.get(r.cf_dipendente)
        return r.cf_dipendente.toLowerCase().includes(lower) ||
          personLabel(p, r.cf_dipendente).toLowerCase().includes(lower)
      })
    )
  }, [groups, search, personaMap])

  const handleConfirmReassign = async () => {
    if (!pendingReassign) return
    const r = pendingReassign
    setPendingReassign(null)
    try {
      const res = await api.timesheet.update(r.cf_dipendente, { cf_supervisore: r.to_cf_supervisore })
      if (res.success) {
        await refreshTimesheet()
        showToast(`${r.dipendente_label} spostato sotto ${r.to_label}`, 'success')
      } else {
        showToast(res.error ?? 'Errore nel riassegnamento', 'error')
      }
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 bg-slate-900">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Cerca responsabile o dipendente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <span className="text-xs text-slate-500 ml-auto flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {filtered.length} responsabili
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-sm">Nessun responsabile trovato</p>
          </div>
        ) : (
          <Accordion.Root type="multiple" className="border border-slate-700 rounded-md">
            {filtered.map(group => (
              <Accordion.Item key={group.cf} value={group.cf} className="border-b border-slate-700 last:border-0">
                <Accordion.Trigger className="w-full px-3 py-2.5 hover:bg-slate-800 transition-colors flex items-center justify-between data-[state=open]:bg-slate-800 group">
                  <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
                    <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-500 transition-transform group-data-[state=open]:rotate-180" />
                    <span className="text-sm font-medium text-slate-200 truncate">{group.label}</span>
                    <span className="text-xs text-slate-500 font-mono flex-shrink-0">{group.cf}</span>
                    {group.persona?.qualifica && (
                      <span className="text-xs text-slate-500 hidden md:inline truncate">{group.persona.qualifica}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-xs bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 rounded-full px-2 py-0.5">
                      {group.records.length}
                    </span>
                    {group.persona && (
                      <button
                        onClick={e => { e.stopPropagation(); setDrawerRecord(group.persona!); setDrawerOpen(true) }}
                        className="text-xs px-2 py-1 text-indigo-400 hover:bg-indigo-900/30 rounded transition-colors"
                      >
                        Apri
                      </button>
                    )}
                  </div>
                </Accordion.Trigger>

                <Accordion.Content className="px-4 py-2 bg-slate-800/30">
                  <div className="space-y-0.5">
                    {group.records
                      .sort((a, b) => {
                        const la = personLabel(personaMap.get(a.cf_dipendente), a.cf_dipendente)
                        const lb = personLabel(personaMap.get(b.cf_dipendente), b.cf_dipendente)
                        return la.localeCompare(lb)
                      })
                      .map(r => (
                        <SubItem
                          key={r.cf_dipendente}
                          record={r}
                          persona={personaMap.get(r.cf_dipendente)}
                          onOpenPersona={p => { setDrawerRecord(p); setDrawerOpen(true) }}
                        />
                      ))}
                  </div>
                </Accordion.Content>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        )}
      </div>

      {/* Confirm reassign */}
      <ConfirmDialog
        open={pendingReassign !== null}
        title="Riassegna responsabile"
        message={
          pendingReassign
            ? `Sposta "${pendingReassign.dipendente_label}" da "${pendingReassign.from_cf_supervisore ?? '(nessuno)'}" a "${pendingReassign.to_label}"?`
            : ''
        }
        confirmLabel="Conferma"
        confirmVariant="primary"
        onConfirm={handleConfirmReassign}
        onCancel={() => setPendingReassign(null)}
      />

      {/* Record Drawer */}
      <RecordDrawer
        open={drawerOpen}
        type="persona"
        record={drawerRecord ?? undefined}
        initialMode="view"
        onClose={() => setDrawerOpen(false)}
        onSaved={() => refreshTimesheet()}
      />
    </div>
  )
}
