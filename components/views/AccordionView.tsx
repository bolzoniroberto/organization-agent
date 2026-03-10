'use client'
import React, { useState, useMemo } from 'react'
import { Search, ChevronDown, GripVertical } from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import * as Accordion from '@radix-ui/react-accordion'
import { useHRStore } from '@/store/useHRStore'
import type { NodoOrganigramma } from '@/types'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import RecordDrawer from '@/components/shared/RecordDrawer'
import RoleBadge from '@/components/shared/RoleBadge'
import { api } from '@/lib/api'

// ── Pending move ─────────────────────────────────────────────────────────────
interface PendingMove {
  nodeId: string
  label: string
  fromParent: string | null
  toParent: string | null
  toLabel: string
}

// ── DnD wrappers ─────────────────────────────────────────────────────────────
function DraggableNode({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `node::${id}` })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: 0.8, zIndex: 50, position: 'relative' as const }
    : {}
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'ring-2 ring-indigo-400 rounded-md' : ''}>
      <div className="flex items-center w-full">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 text-slate-600 hover:text-slate-400 flex-shrink-0 touch-none"
          title="Trascina per spostare"
        >
          <GripVertical className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  )
}

function DroppableNode({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop::${id}` })
  return (
    <div ref={setNodeRef} className={isOver ? 'ring-2 ring-indigo-400 rounded-md bg-indigo-900/20 transition-colors' : 'transition-colors'}>
      {children}
    </div>
  )
}

// ── Tree types ────────────────────────────────────────────────────────────────
interface TreeNode {
  nodo: NodoOrganigramma
  children: TreeNode[]
}

function buildTree(
  nodi: NodoOrganigramma[],
  filteredIds?: Set<string>
): TreeNode[] {
  const byParent = new Map<string | null, NodoOrganigramma[]>()

  nodi.forEach(n => {
    if (filteredIds && !filteredIds.has(n.id)) return
    const p = n.reports_to ?? null
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p)!.push(n)
  })

  function build(parentId: string | null): TreeNode[] {
    const children = byParent.get(parentId) ?? []
    return children
      .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
      .map(n => ({
        nodo: n,
        children: build(n.id),
      }))
  }

  return build(null)
}

// ── Accordion item ────────────────────────────────────────────────────────────
interface AccordionNodeItemProps {
  treeNode: TreeNode
  onEdit: (n: NodoOrganigramma) => void
  compact: boolean
}

function AccordionNodeItem({ treeNode, onEdit, compact }: AccordionNodeItemProps) {
  const n = treeNode.nodo
  return (
    <DroppableNode id={n.id}>
      <Accordion.Item value={n.id} className="border-b border-slate-700">
        <Accordion.Trigger className="w-full px-3 py-2 hover:bg-slate-800 transition-colors flex items-center justify-between data-[state=open]:bg-slate-800">
          <DraggableNode id={n.id}>
            <div className="flex items-center justify-between w-full pr-2">
              <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-500 transition-transform" />
                <RoleBadge value={n.tipo_nodo} />
                <span className="font-mono text-xs text-slate-400 flex-shrink-0">{n.id}</span>
                {!compact && n.nome_uo && (
                  <span className="text-sm text-slate-300 truncate">{n.nome_uo}</span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                {n.cf_persona && (
                  <span className="text-xs text-slate-500 font-mono">{n.cf_persona}</span>
                )}
                {n.centro_costo && !compact && (
                  <span className="text-xs text-slate-600">{n.centro_costo}</span>
                )}
                {treeNode.children.length > 0 && (
                  <span className="text-xs text-slate-600">{treeNode.children.length} sub</span>
                )}
              </div>
            </div>
          </DraggableNode>
        </Accordion.Trigger>

        <Accordion.Content className="px-3 py-2 bg-slate-800/50">
          <div className="space-y-2">
            {/* Node detail card */}
            <div className="py-2 px-3 bg-slate-900 border border-slate-700 rounded-md">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0 space-y-1">
                  {!compact && (
                    <>
                      {n.nome_uo && <div className="text-sm text-slate-200">{n.nome_uo}</div>}
                      {n.job_title && <div className="text-xs text-slate-400">{n.job_title}</div>}
                      {n.cf_persona && <div className="text-xs text-slate-500 font-mono">CF: {n.cf_persona}</div>}
                      {n.centro_costo && <div className="text-xs text-slate-500">CdC: {n.centro_costo}</div>}
                    </>
                  )}
                </div>
                <button
                  onClick={() => onEdit(n)}
                  className="text-xs px-2 py-1 text-indigo-400 hover:bg-indigo-900/30 rounded transition-colors ml-2 flex-shrink-0"
                >
                  Apri
                </button>
              </div>
            </div>

            {/* Children */}
            {treeNode.children.length > 0 && (
              <div className="ml-4">
                <div className="text-xs text-slate-600 mb-1">Sottostrutture ({treeNode.children.length})</div>
                <Accordion.Root type="multiple" className="border border-slate-700 rounded-md">
                  {treeNode.children.map(child => (
                    <AccordionNodeItem
                      key={child.nodo.id}
                      treeNode={child}
                      onEdit={onEdit}
                      compact={compact}
                    />
                  ))}
                </Accordion.Root>
              </div>
            )}
          </div>
        </Accordion.Content>
      </Accordion.Item>
    </DroppableNode>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AccordionView() {
  const { nodi, refreshNodi, showToast } = useHRStore()
  const [search, setSearch] = useState('')
  const [compact, setCompact] = useState(false)
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<NodoOrganigramma | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const activeNodi = useMemo(() => nodi.filter(n => !n.deleted_at), [nodi])

  const searchResults = useMemo(() => {
    if (!search) return undefined
    const lower = search.toLowerCase()
    const matching = new Set<string>()

    // collect directly matching nodes
    const direct = new Set<string>()
    activeNodi.forEach(n => {
      if (
        n.id?.toLowerCase().includes(lower) ||
        n.nome_uo?.toLowerCase().includes(lower) ||
        n.cf_persona?.toLowerCase().includes(lower)
      ) {
        direct.add(n.id)
      }
    })

    // include ancestors so tree renders
    const addAncestors = (id: string) => {
      if (matching.has(id)) return
      matching.add(id)
      const node = activeNodi.find(n => n.id === id)
      if (node?.reports_to) addAncestors(node.reports_to)
    }
    direct.forEach(id => addAncestors(id))

    return matching
  }, [search, activeNodi])

  const treeData = useMemo(
    () => buildTree(activeNodi, searchResults),
    [activeNodi, searchResults]
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (!overId.startsWith('drop::')) return

    const toId = overId.replace('drop::', '')
    if (!activeId.startsWith('node::')) return
    const nodeId = activeId.replace('node::', '')

    if (nodeId === toId) return
    const node = activeNodi.find(n => n.id === nodeId)
    if (!node) return

    const newParent = toId === nodeId ? null : toId
    if (node.reports_to === newParent) return

    // prevent cycles: check toId is not a descendant
    const isDescendant = (id: string, ancestorId: string): boolean => {
      const n = activeNodi.find(x => x.id === id)
      if (!n?.reports_to) return false
      if (n.reports_to === ancestorId) return true
      return isDescendant(n.reports_to, ancestorId)
    }
    if (isDescendant(toId, nodeId)) {
      showToast('Impossibile spostare: formerebbe un ciclo', 'error')
      return
    }

    const toLabel = activeNodi.find(n => n.id === toId)?.nome_uo ?? toId
    setPendingMove({
      nodeId,
      label: node.nome_uo ?? nodeId,
      fromParent: node.reports_to,
      toParent: toId,
      toLabel,
    })
  }

  const handleConfirmMove = async () => {
    if (!pendingMove) return
    const move = pendingMove
    setPendingMove(null)
    try {
      const result = await api.org.update(move.nodeId, { reports_to: move.toParent })
      if (result.success) {
        await refreshNodi()
        showToast(`Nodo "${move.nodeId}" spostato sotto "${move.toLabel}"`, 'success')
      } else {
        showToast(result.error ?? 'Errore nello spostamento', 'error')
      }
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  const pendingMoveMessage = pendingMove
    ? `Stai spostando il nodo "${pendingMove.label}" (${pendingMove.nodeId})\n\nDa: ${pendingMove.fromParent ?? '(radice)'}\nA:  ${pendingMove.toLabel} (${pendingMove.toParent})`
    : ''

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-700 bg-slate-900">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Cerca nodo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <button
          onClick={() => setCompact(c => !c)}
          className={`text-sm px-3 py-1.5 rounded-md transition-colors ${compact ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
        >
          {compact ? 'Compatto' : 'Esteso'}
        </button>

        <span className="text-xs text-slate-600 ml-auto">
          ≡ Trascina per spostare nodi
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {treeData.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500 text-sm">Nessun nodo trovato</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Accordion.Root type="multiple" className="border border-slate-700 rounded-md">
              {treeData.map(rootNode => (
                <AccordionNodeItem
                  key={rootNode.nodo.id}
                  treeNode={rootNode}
                  onEdit={n => { setDrawerRecord(n); setDrawerOpen(true) }}
                  compact={compact}
                />
              ))}
            </Accordion.Root>
          </DndContext>
        )}
      </div>

      {/* Confirm move */}
      <ConfirmDialog
        open={pendingMove !== null}
        title="Sposta nodo"
        message={pendingMoveMessage}
        confirmLabel="Conferma spostamento"
        confirmVariant="primary"
        onConfirm={handleConfirmMove}
        onCancel={() => setPendingMove(null)}
      />

      {/* Record Drawer */}
      <RecordDrawer
        open={drawerOpen}
        type="nodo"
        record={drawerRecord ?? undefined}
        initialMode="view"
        onClose={() => setDrawerOpen(false)}
        onSaved={() => refreshNodi()}
      />
    </div>
  )
}
