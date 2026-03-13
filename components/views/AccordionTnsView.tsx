'use client'
import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { Search, ChevronDown, ChevronRight, User, Pencil, Trash2, RotateCcw, X, Check } from 'lucide-react'
import * as Accordion from '@radix-ui/react-accordion'
import {
  DndContext, DragOverlay, closestCenter, useDraggable, useDroppable,
  type DragEndEvent, type DragStartEvent
} from '@dnd-kit/core'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import type { Persona, StrutturaTns } from '@/types'

interface TreeNode {
  struttura: StrutturaTns
  personeDirecte: Persona[]
  children: TreeNode[]
  color: 'green' | 'amber' | 'gray'
  subtreePersonCount: number
}

function buildTree(strutture: StrutturaTns[], persone: Persona[]): TreeNode[] {
  // Filtra le strutture CF-foglia (codice = CF di una persona, create da DB_TNS)
  const cfSet = new Set(persone.map(p => p.cf))
  const realStrutture = strutture.filter(s => !cfSet.has(s.codice))

  const byParent = new Map<string | null, StrutturaTns[]>()
  realStrutture.forEach(s => {
    const p = s.padre ?? null
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p)!.push(s)
  })
  // Attacca le persone tramite padre_tns (non codice_tns, che = cf)
  const personeByStruttura = new Map<string, Persona[]>()
  persone.forEach(p => {
    if (!p.padre_tns) return
    if (!personeByStruttura.has(p.padre_tns)) personeByStruttura.set(p.padre_tns, [])
    personeByStruttura.get(p.padre_tns)!.push(p)
  })

  function build(parentId: string | null): TreeNode[] {
    return (byParent.get(parentId) ?? [])
      .sort((a, b) => a.codice.localeCompare(b.codice))
      .map(s => {
        const personeDirecte = personeByStruttura.get(s.codice) ?? []
        const children = build(s.codice)
        const subtreePersonCount = personeDirecte.length + children.reduce((sum, c) => sum + c.subtreePersonCount, 0)
        const color: 'green' | 'amber' | 'gray' =
          personeDirecte.length > 0 ? 'green' :
          subtreePersonCount > 0 ? 'amber' : 'gray'
        return { struttura: s, personeDirecte, children, color, subtreePersonCount }
      })
  }
  return build(null)
}

const COLOR_DOT: Record<string, string> = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  gray: 'bg-slate-600',
}
const COLOR_BORDER: Record<string, string> = {
  green: 'border-green-700/40',
  amber: 'border-amber-700/40',
  gray: 'border-slate-700',
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-5 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-slate-200 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 border border-slate-600 rounded-md">Annulla</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Conferma</button>
        </div>
      </div>
    </div>
  )
}

function DraggablePersona({ persona, anomalia }: { persona: Persona; anomalia?: 'orfana' | 'invalida' }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `persona::${persona.cf}`,
    data: { type: 'persona', cf: persona.cf, padreTns: persona.padre_tns },
  })
  const base = anomalia === 'orfana'
    ? 'bg-amber-950/40 border-amber-800/50 hover:bg-amber-950/70'
    : anomalia === 'invalida'
    ? 'bg-red-950/40 border-red-800/50 hover:bg-red-950/70'
    : 'bg-slate-800 border-slate-700 hover:bg-slate-700'
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={`flex items-center gap-2 px-2 py-1 rounded text-xs border cursor-grab select-none transition-opacity ${base} ${isDragging ? 'opacity-30' : ''}`}>
      <User className="w-3 h-3 text-slate-500 flex-shrink-0" />
      <span className="font-mono text-slate-400 flex-shrink-0">{persona.cf}</span>
      {persona.cognome && <span className="text-slate-300 truncate">{persona.cognome} {persona.nome}</span>}
    </div>
  )
}

function DroppableStruttura({
  treeNode, compact, showDeleted, onRefresh, showToast, onDrop
}: {
  treeNode: TreeNode
  compact: boolean
  showDeleted: boolean
  onRefresh: () => void
  showToast: (m: string, t?: 'success' | 'error') => void
  onDrop: (strutturaCodice: string, type: 'persona' | 'struttura', id: string, currentParent: string | null) => void
}) {
  const s = treeNode.struttura
  const { setNodeRef, isOver } = useDroppable({ id: `struttura::${s.codice}`, data: { type: 'struttura', codice: s.codice } })
  const [editing, setEditing] = useState(false)
  const [editNome, setEditNome] = useState(s.nome ?? '')

  const handleSaveEdit = async () => {
    if (editNome === (s.nome ?? '')) { setEditing(false); return }
    try {
      const r = await api.struttureTns.update(s.codice, { nome: editNome })
      if (r.success) { showToast('Nome aggiornato'); onRefresh() } else showToast(r.error ?? 'Errore', 'error')
    } catch (e) { showToast(String(e), 'error') }
    setEditing(false)
  }

  const [deleteBlocked, setDeleteBlocked] = useState<{ childCount: number; personCount: number; subtreeCount: number } | null>(null)

  const handleDelete = async () => {
    try {
      const r = await api.struttureTns.delete(s.codice)
      if (r.success) {
        showToast('Struttura eliminata'); onRefresh()
      } else if (r.blocked) {
        setDeleteBlocked({ childCount: r.childCount ?? 0, personCount: r.personCount ?? 0, subtreeCount: r.subtreeCount ?? 0 })
      } else {
        showToast(r.error ?? 'Errore', 'error')
      }
    } catch (e) { showToast(String(e), 'error') }
  }

  const handleForceDelete = async () => {
    setDeleteBlocked(null)
    try {
      const r = await api.struttureTns.delete(s.codice, true)
      if (r.success) { showToast('Struttura eliminata'); onRefresh() } else showToast(r.error ?? 'Errore', 'error')
    } catch (e) { showToast(String(e), 'error') }
  }

  const handleRestore = async () => {
    try {
      const r = await api.struttureTns.restore(s.codice)
      if (r.success) { showToast('Struttura ripristinata'); onRefresh() } else showToast(r.error ?? 'Errore', 'error')
    } catch (e) { showToast(String(e), 'error') }
  }

  const isDeleted = !!s.deleted_at
  if (isDeleted && !showDeleted) return null

  return (
    <Accordion.Item value={s.codice} className={`border-b ${COLOR_BORDER[treeNode.color]} ${isDeleted ? 'opacity-50' : ''}`}>
      <Accordion.Trigger
        ref={setNodeRef}
        className={`w-full px-3 py-2 transition-colors flex items-center justify-between data-[state=open]:bg-slate-800/80 ${isOver ? 'bg-indigo-900/30 ring-1 ring-inset ring-indigo-500' : 'hover:bg-slate-800'}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-500 transition-transform" />
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${COLOR_DOT[treeNode.color]}`} />
          <span className="font-mono text-xs text-slate-400 flex-shrink-0">{s.codice}</span>
          {!compact && s.nome && (
            editing ? (
              <input
                className="text-sm bg-slate-700 border border-slate-500 rounded px-1 text-slate-200 w-40 focus:outline-none"
                value={editNome}
                onChange={e => setEditNome(e.target.value)}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditing(false) }}
                autoFocus
              />
            ) : (
              <span className="text-sm text-slate-300 truncate">{s.nome}</span>
            )
          )}
          {s.livello && <span className="text-xs text-slate-600">Lv.{s.livello}</span>}
          {treeNode.subtreePersonCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400 ml-1">{treeNode.subtreePersonCount}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
          {editing ? (
            <>
              <button onClick={handleSaveEdit} className="p-1 text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditing(false)} className="p-1 text-slate-500 hover:text-slate-300"><X className="w-3.5 h-3.5" /></button>
            </>
          ) : (
            <>
              {!isDeleted && <button onClick={() => { setEditing(true); setEditNome(s.nome ?? '') }} className="p-1 text-slate-600 hover:text-slate-300"><Pencil className="w-3 h-3" /></button>}
              {!isDeleted && <button onClick={handleDelete} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>}
              {isDeleted && <button onClick={handleRestore} className="p-1 text-slate-600 hover:text-green-400"><RotateCcw className="w-3 h-3" /></button>}
            </>
          )}
          {treeNode.children.length > 0 && <span className="text-xs text-slate-600 ml-1">{treeNode.children.length} sub</span>}
        </div>
      </Accordion.Trigger>

      <Accordion.Content className="px-3 py-2 bg-slate-900/40">
        <div className="space-y-2">
          {treeNode.personeDirecte.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {treeNode.personeDirecte.map(p => <DraggablePersona key={p.cf} persona={p} />)}
            </div>
          )}
          {treeNode.children.length > 0 && (
            <div className="ml-3">
              <Accordion.Root type="multiple" className={`border ${COLOR_BORDER[treeNode.color]} rounded-md`}>
                {treeNode.children.map(child => (
                  <DroppableStruttura
                    key={child.struttura.codice}
                    treeNode={child}
                    compact={compact}
                    showDeleted={showDeleted}
                    onRefresh={onRefresh}
                    showToast={showToast}
                    onDrop={onDrop}
                  />
                ))}
              </Accordion.Root>
            </div>
          )}
          {treeNode.personeDirecte.length === 0 && treeNode.children.length === 0 && (
            <p className="text-xs text-slate-600 italic py-1">Nessuna persona assegnata</p>
          )}
        </div>
      </Accordion.Content>

      {deleteBlocked && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setDeleteBlocked(null)}>
          <div className="bg-slate-800 border border-red-700 rounded-lg p-5 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-red-300 mb-2">Struttura non vuota</h3>
            <p className="text-sm text-slate-300 mb-3">
              <span className="font-medium text-slate-100">{s.nome ?? s.codice}</span> contiene:
            </p>
            <ul className="text-sm text-slate-400 mb-4 space-y-1 pl-3">
              {deleteBlocked.childCount > 0 && <li>• <span className="text-amber-300">{deleteBlocked.childCount}</span> figli diretti</li>}
              {deleteBlocked.subtreeCount > 0 && <li>• <span className="text-amber-300">{deleteBlocked.subtreeCount}</span> discendenti totali</li>}
              {deleteBlocked.personCount > 0 && <li>• <span className="text-green-300">{deleteBlocked.personCount}</span> persone assegnate</li>}
            </ul>
            <p className="text-xs text-slate-500 mb-4">
              I figli rimarranno nel DB ma appariranno come radici orfane finché non vengono riassegnati.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteBlocked(null)} className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 border border-slate-600 rounded-md">
                Annulla
              </button>
              <button onClick={handleForceDelete} className="px-3 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded-md">
                Elimina comunque
              </button>
            </div>
          </div>
        </div>
      )}
    </Accordion.Item>
  )
}

function UnassignedPanel({ persone, struttureTnsSet, filterAnomalia }: {
  persone: Persona[]
  struttureTnsSet: Set<string>
  filterAnomalia: 'orfani' | 'invalidi' | ''
}) {
  const { orfani, invalidi, nonAssegnati } = useMemo(() => {
    const orfani: Persona[] = []
    const invalidi: Persona[] = []
    const nonAssegnati: Persona[] = []
    for (const p of persone) {
      if (!p.padre_tns) {
        if (p.codice_tns) orfani.push(p)
        // persone senza nessun dato TNS le ignoriamo qui
      } else if (!struttureTnsSet.has(p.padre_tns)) {
        invalidi.push(p)
      } else {
        // hanno padre_tns valido: non appaiono nel pannello
      }
    }
    // non assegnati = tutti senza padre_tns valido
    for (const p of persone) {
      if (!p.padre_tns || !struttureTnsSet.has(p.padre_tns)) nonAssegnati.push(p)
    }
    return { orfani, invalidi, nonAssegnati }
  }, [persone, struttureTnsSet])

  const visible = filterAnomalia === 'orfani' ? orfani
    : filterAnomalia === 'invalidi' ? invalidi
    : nonAssegnati

  if (visible.length === 0 && filterAnomalia === '') return null

  return (
    <div className="w-64 flex-shrink-0 border-l border-slate-700 bg-slate-900/50 flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">
          {filterAnomalia === 'orfani' ? (
            <span className="text-amber-400">Orfani TNS ({orfani.length})</span>
          ) : filterAnomalia === 'invalidi' ? (
            <span className="text-red-400">Struttura invalida ({invalidi.length})</span>
          ) : (
            <>Non assegnati ({nonAssegnati.length})</>
          )}
        </span>
        {filterAnomalia === '' && orfani.length > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 border border-amber-800">
            {orfani.length} orfani
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {visible.length === 0 ? (
          <p className="text-xs text-slate-600 italic text-center py-4">Nessuno</p>
        ) : visible.map(p => {
          const anomalia = filterAnomalia === 'orfani' ? 'orfana'
            : filterAnomalia === 'invalidi' ? 'invalida'
            : (!p.padre_tns && p.codice_tns) ? 'orfana'
            : (!struttureTnsSet.has(p.padre_tns!)) ? 'invalida'
            : undefined
          return <DraggablePersona key={p.cf} persona={p} anomalia={anomalia} />
        })}
      </div>
    </div>
  )
}

export default function AccordionTnsView() {
  const { struttureTns, persone, refreshStruttureTns, refreshPersone, showToast } = useHRStore()
  const [search, setSearch] = useState('')
  const [compact, setCompact] = useState(false)
  const [showDeleted, setShowDeleted] = useState(false)
  const [filterSede, setFilterSede] = useState('')
  const [hideEmpty, setHideEmpty] = useState(false)
  const [filterAnomalia, setFilterAnomalia] = useState<'orfani' | 'invalidi' | ''>('')
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  useEffect(() => { refreshStruttureTns(showDeleted) }, [showDeleted])

  const sedi = useMemo(() => [...new Set(struttureTns.map(s => s.sede_tns).filter(Boolean))].sort() as string[], [struttureTns])

  const filteredStrutture = useMemo(() => {
    let s = struttureTns
    if (!showDeleted) s = s.filter(x => !x.deleted_at)
    if (filterSede) s = s.filter(x => x.sede_tns === filterSede)
    return s
  }, [struttureTns, showDeleted, filterSede])

  // Solo strutture reali (non CF-foglia) per il pannello non-assegnati
  const cfPersoneSet = useMemo(() => new Set(persone.map(p => p.cf)), [persone])
  const struttureSet = useMemo(() => new Set(struttureTns.filter(s => !s.deleted_at && !cfPersoneSet.has(s.codice)).map(s => s.codice)), [struttureTns, cfPersoneSet])

  const treeData = useMemo(() => {
    let tree = buildTree(filteredStrutture, persone)
    if (hideEmpty) {
      function filterEmpty(nodes: TreeNode[]): TreeNode[] {
        return nodes.filter(n => n.subtreePersonCount > 0).map(n => ({ ...n, children: filterEmpty(n.children) }))
      }
      tree = filterEmpty(tree)
    }
    if (search) {
      const lower = search.toLowerCase()
      const matching = new Set<string>()
      filteredStrutture.forEach(s => {
        if (s.codice.toLowerCase().includes(lower) || s.nome?.toLowerCase().includes(lower)) matching.add(s.codice)
      })
      persone.forEach(p => {
        if ((p.cf.toLowerCase().includes(lower) || p.cognome?.toLowerCase().includes(lower)) && p.padre_tns) matching.add(p.padre_tns)
      })
      // add ancestors
      const addAncestors = (codice: string) => {
        const s = filteredStrutture.find(x => x.codice === codice)
        if (s?.padre && !matching.has(s.padre)) { matching.add(s.padre); addAncestors(s.padre) }
      }
      [...matching].forEach(addAncestors)
      function filterTree(nodes: TreeNode[]): TreeNode[] {
        return nodes.filter(n => matching.has(n.struttura.codice)).map(n => ({ ...n, children: filterTree(n.children) }))
      }
      tree = filterTree(tree)
    }
    return tree
  }, [filteredStrutture, persone, hideEmpty, search])

  const onRefresh = useCallback(async () => {
    await Promise.all([refreshStruttureTns(showDeleted), refreshPersone()])
  }, [refreshStruttureTns, refreshPersone, showDeleted])

  const handleDrop = useCallback((strutturaCodice: string, type: 'persona' | 'struttura', id: string, currentParent: string | null) => {
    if (type === 'persona') {
      const persona = persone.find(p => p.cf === id)
      const targetNome = struttureTns.find(s => s.codice === strutturaCodice)?.nome ?? strutturaCodice
      setConfirm({
        message: `Sposta ${persona?.cognome ?? id} in "${targetNome}"?`,
        onConfirm: async () => {
          setConfirm(null)
          try {
            const r = await api.tns.update(id, { padre_tns: strutturaCodice })
            if (r.success) { showToast('Persona riassegnata'); await onRefresh() } else showToast(r.error ?? 'Errore', 'error')
          } catch (e) { showToast(String(e), 'error') }
        }
      })
    } else {
      if (id === strutturaCodice || strutturaCodice === currentParent) return
      const struttura = struttureTns.find(s => s.codice === id)
      const targetNome = struttureTns.find(s => s.codice === strutturaCodice)?.nome ?? strutturaCodice
      setConfirm({
        message: `Sposta struttura "${struttura?.nome ?? id}" sotto "${targetNome}"?`,
        onConfirm: async () => {
          setConfirm(null)
          try {
            const r = await api.struttureTns.setParent(id, strutturaCodice)
            if (r.success) { showToast('Struttura spostata'); await onRefresh() } else showToast(r.error ?? 'Errore', 'error')
          } catch (e) { showToast(String(e), 'error') }
        }
      })
    }
  }, [persone, struttureTns, onRefresh, showToast])

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setDraggingId(String(e.active.id))
  }, [])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    setDraggingId(null)
    const { active, over } = e
    if (!over) return
    const activeData = active.data.current as { type: string; cf?: string; codice?: string; padreTns?: string | null; padre?: string | null } | undefined
    const overData = over.data.current as { type: string; codice: string } | undefined
    if (!activeData || !overData || overData.type !== 'struttura') return
    const target = overData.codice
    if (activeData.type === 'persona' && activeData.cf) {
      if (activeData.padreTns === target) return
      handleDrop(target, 'persona', activeData.cf, activeData.padreTns ?? null)
    } else if (activeData.type === 'struttura' && activeData.codice) {
      if (activeData.codice === target) return
      handleDrop(target, 'struttura', activeData.codice, activeData.padre ?? null)
    }
  }, [handleDrop])

  const draggingPersona = useMemo(() => {
    if (!draggingId?.startsWith('persona::')) return null
    const cf = draggingId.replace('persona::', '')
    return persone.find(p => p.cf === cf) ?? null
  }, [draggingId, persone])

  return (
    <DndContext collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full bg-slate-950">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700 bg-slate-900 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text" placeholder="Cerca struttura o persona..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-52 pl-8 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {sedi.length > 0 && (
            <select value={filterSede} onChange={e => setFilterSede(e.target.value)}
              className="text-sm bg-slate-800 border border-slate-600 rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              <option value="">Tutte le sedi</option>
              {sedi.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          <button onClick={() => setHideEmpty(v => !v)}
            className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${hideEmpty ? 'bg-amber-600/20 text-amber-300 border-amber-700' : 'border-slate-600 text-slate-400 hover:text-slate-200'}`}>
            {hideEmpty ? 'Solo con persone' : 'Tutte'}
          </button>

          <button onClick={() => setShowDeleted(v => !v)}
            className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${showDeleted ? 'bg-red-900/20 text-red-300 border-red-700' : 'border-slate-600 text-slate-400 hover:text-slate-200'}`}>
            Eliminate
          </button>

          <button onClick={() => setCompact(c => !c)}
            className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${compact ? 'bg-indigo-600/20 text-indigo-300 border-indigo-700' : 'border-slate-600 text-slate-400 hover:text-slate-200'}`}>
            {compact ? 'Compatto' : 'Esteso'}
          </button>

          <select
            value={filterAnomalia}
            onChange={e => setFilterAnomalia(e.target.value as 'orfani' | 'invalidi' | '')}
            className={`text-sm rounded-md px-2 py-1.5 border focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors ${filterAnomalia ? 'bg-amber-900/20 border-amber-700 text-amber-300' : 'bg-slate-800 border-slate-600 text-slate-300'}`}
          >
            <option value="">Anomalie TNS</option>
            <option value="orfani">Orfani (no struttura)</option>
            <option value="invalidi">Struttura invalida</option>
          </select>

          <div className="ml-auto flex items-center gap-3 text-xs text-slate-600">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Con persone</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Indiretto</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600" /> Vuota</span>
            <span>{filteredStrutture.filter(s => !cfPersoneSet.has(s.codice)).length} strutture · {persone.filter(p => p.padre_tns).length} persone TNS</span>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            {treeData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-500 text-sm">Nessuna struttura TNS trovata</p>
              </div>
            ) : (
              <Accordion.Root type="multiple" className="border border-slate-700 rounded-md">
                {treeData.map(root => (
                  <DroppableStruttura
                    key={root.struttura.codice}
                    treeNode={root}
                    compact={compact}
                    showDeleted={showDeleted}
                    onRefresh={onRefresh}
                    showToast={showToast}
                    onDrop={handleDrop}
                  />
                ))}
              </Accordion.Root>
            )}
          </div>

          <UnassignedPanel persone={persone} struttureTnsSet={struttureSet} filterAnomalia={filterAnomalia} />
        </div>
      </div>

      <DragOverlay>
        {draggingPersona && (
          <div className="flex items-center gap-2 px-2 py-1 rounded text-xs bg-slate-700 border border-indigo-500 shadow-xl">
            <User className="w-3 h-3 text-indigo-400" />
            <span className="font-mono text-slate-300">{draggingPersona.cf}</span>
            {draggingPersona.cognome && <span className="text-slate-200">{draggingPersona.cognome} {draggingPersona.nome}</span>}
          </div>
        )}
      </DragOverlay>

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </DndContext>
  )
}
