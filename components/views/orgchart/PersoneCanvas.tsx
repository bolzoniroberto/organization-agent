'use client'
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type EdgeProps,
  BackgroundVariant, useReactFlow, useViewport,
  BaseEdge, getSmoothStepPath, Position
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Search, X } from 'lucide-react'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import type { SupervisioneTimesheet, Persona } from '@/types'
import OrgNode from '@/components/orgchart/OrgNode'
import NodeContextMenu from '@/components/orgchart/NodeContextMenu'
import RecordDrawer from '@/components/shared/RecordDrawer'
import {
  buildTree, analyzeTree, layoutTree, flattenTree, getBoundingBox,
  findWidestHorizontalSubtree, type TreeNode, type LayoutConfig
} from '@/lib/orgchart-layout'
import { useOrgDrill } from '@/lib/use-org-drill'

const NODE_TYPES = { orgNode: OrgNode }
const TARGET_RATIO = 1.8
const MAX_ITER = 5

type ColorMode = 'none' | 'societa' | 'area'
type ColorScheme = { border: string; bg: string }
type NodeBox = { x: number; y: number; w: number; h: number }

const NODE_FIELD_OPTIONS = [
  { value: '', label: '— nessuno —' },
  { value: 'nome_completo', label: 'Nome Cognome' },
  { value: 'qualifica', label: 'Qualifica' },
  { value: 'area', label: 'Area' },
  { value: 'societa', label: 'Società' },
  { value: 'sede', label: 'Sede' },
  { value: 'tipo_contratto', label: 'Tipo Contratto' },
  { value: 'email', label: 'Email' },
  { value: 'cf', label: 'CF' },
]

function buildColorMap(
  timesheet: SupervisioneTimesheet[],
  mode: ColorMode,
  personaMap: Map<string, Persona>
): Map<string, ColorScheme> {
  if (mode === 'none') return new Map()
  const vals = timesheet.map(t => {
    const p = personaMap.get(t.cf_dipendente)
    return mode === 'societa' ? (p?.societa ?? '') : (p?.area ?? '')
  }).filter(Boolean)
  const unique = [...new Set(vals)]
  return new Map(unique.map((val, i) => [
    val,
    {
      border: `hsl(${Math.round((i / unique.length) * 300)}, 55%, 55%)`,
      bg: `hsl(${Math.round((i / unique.length) * 300)}, 55%, 97%)`
    }
  ]))
}

function segmentIntersectsBox(x1: number, y1: number, x2: number, y2: number, box: NodeBox): boolean {
  const midX = (x1 + x2) / 2
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
  return midX >= box.x && midX <= box.x + box.w && maxY >= box.y && minY <= box.y + box.h
}

function OrgEdge({ id, sourceX, sourceY, targetX, targetY, data, style }: EdgeProps) {
  const obstructed = (data as { nodeBoxes?: NodeBox[] } | undefined)?.nodeBoxes?.some(
    box => segmentIntersectsBox(sourceX, sourceY, targetX, targetY, box)
  ) ?? false
  const [path] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition: Position.Bottom,
    targetX, targetY, targetPosition: Position.Top,
    borderRadius: obstructed ? 8 : 5,
    ...(obstructed ? { offset: 40 } : {})
  })
  return <BaseEdge id={id} path={path} style={style} />
}
const EDGE_TYPES = { orgEdge: OrgEdge }

export default function PersoneCanvas() {
  const { timesheet, persone, refreshAll, showToast } = useHRStore()

  const personaMap = useMemo(() => {
    const m = new Map<string, Persona>()
    persone.forEach(p => m.set(p.cf, p))
    return m
  }, [persone])

  const getPersonaField = useCallback((cf: string, field: string): string | null => {
    const p = personaMap.get(cf)
    if (!p) return null
    if (field === 'nome_completo') return `${p.cognome ?? ''} ${p.nome ?? ''}`.trim() || null
    return (p as unknown as Record<string, unknown>)[field] as string | null
  }, [personaMap])

  const getLabel = useCallback((cf: string): string => {
    const p = personaMap.get(cf)
    return p ? `${p.cognome ?? ''} ${p.nome ?? ''}`.trim() || cf : cf
  }, [personaMap])

  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<Persona | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<SupervisioneTimesheet[]>([])
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('none')
  const [nodeFields, setNodeFields] = useState<[string, string, string]>(['nome_completo', 'qualifica', 'area'])
  const [focusedNode, setFocusedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const prevVisibleIdsRef = useRef<Set<string>>(new Set())
  const compactModeRef = useRef(false)
  const { fitView, setCenter } = useReactFlow()
  const { zoom } = useViewport()
  const { drillRootId, drillMode, drillInto, drillTo } = useOrgDrill()

  const drillBreadcrumb = useMemo(() => {
    const items: { id: string | null; label: string }[] = [{ id: null, label: 'Radice' }]
    if (!drillRootId) return items
    const ancestors: { id: string; label: string }[] = []
    let cur: string | null = drillRootId
    while (cur) {
      const t = timesheet.find(t => t.cf_dipendente === cur)
      if (!t) break
      ancestors.unshift({ id: cur, label: getLabel(cur) })
      cur = t.cf_supervisore ?? null
    }
    return [...items, ...ancestors]
  }, [drillRootId, timesheet, getLabel])
  const initializedRef = useRef(false)
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [dragEditMode, setDragEditMode] = useState(false)
  const [dragTargetId, setDragTargetId] = useState<string | null>(null)
  const [dragResetKey, setDragResetKey] = useState(0)
  const [pendingReparent, setPendingReparent] = useState<{
    nodeId: string; nodeLabel: string; newParentId: string; newParentLabel: string
  } | null>(null)
  const [reparenting, setReparenting] = useState(false)
  const nodesRef = useRef<Node[]>([])

  useEffect(() => {
    if (!initializedRef.current && timesheet.length > 0) {
      initializedRef.current = true
      setCollapsedSet(new Set(timesheet.map(t => t.cf_dipendente)))
    }
  }, [timesheet])

  const drilledTimesheet = useMemo(() => {
    if (!drillRootId) return timesheet
    const visibleIds = new Set<string>()
    let cur: string | null = drillRootId
    while (cur) {
      visibleIds.add(cur)
      cur = timesheet.find(t => t.cf_dipendente === cur)?.cf_supervisore ?? null
    }
    if (drillMode === 'expand') {
      function collectAll(id: string) {
        timesheet.filter(t => t.cf_supervisore === id).forEach(t => { visibleIds.add(t.cf_dipendente); collectAll(t.cf_dipendente) })
      }
      collectAll(drillRootId)
    } else {
      timesheet.filter(t => t.cf_supervisore === drillRootId).forEach(t => visibleIds.add(t.cf_dipendente))
    }
    return timesheet.filter(t => visibleIds.has(t.cf_dipendente))
  }, [timesheet, drillRootId, drillMode])

  const childCountMap = useMemo(() => {
    const map = new Map<string, number>()
    timesheet.forEach(t => { if (t.cf_supervisore) map.set(t.cf_supervisore, (map.get(t.cf_supervisore) ?? 0) + 1) })
    return map
  }, [timesheet])

  const visibleTree = useMemo(() => {
    function filterTree(nodes: TreeNode<SupervisioneTimesheet>[]): TreeNode<SupervisioneTimesheet>[] {
      return nodes.map(n => {
        if (collapsedSet.has(n.id)) return { ...n, children: [] }
        return { ...n, children: filterTree(n.children) }
      })
    }
    const root = buildTree(drilledTimesheet, t => t.cf_dipendente, t => t.cf_supervisore)
    const metrics = analyzeTree(root)
    const cfg: LayoutConfig = {
      gridCols: metrics.dynamicGridCols,
      verticalStackingDepth: metrics.useVerticalStacking ? 7 : null,
      forcedVerticalNodes: new Set()
    }
    const f = filterTree(root)
    layoutTree(f, 0, cfg)

    let iter = 0
    let bbox = getBoundingBox(f)
    let ratio = (bbox.maxX - bbox.minX) / Math.max(1, bbox.maxY - bbox.minY)
    while (ratio > TARGET_RATIO && iter < MAX_ITER && metrics.totalNodes > 20) {
      const target = findWidestHorizontalSubtree(f)
      if (!target) break
      target._verticalStacked = true
      cfg.forcedVerticalNodes.add(target.id)
      layoutTree(f, 0, cfg)
      bbox = getBoundingBox(f)
      ratio = (bbox.maxX - bbox.minX) / Math.max(1, bbox.maxY - bbox.minY)
      iter++
    }
    return flattenTree(f)
  }, [drilledTimesheet, collapsedSet])

  const compactMode = useMemo(() => {
    const n = visibleTree.length
    if (!compactModeRef.current && n > 50 && zoom < 0.4) compactModeRef.current = true
    else if (compactModeRef.current && (zoom > 0.4 || n < 35)) compactModeRef.current = false
    return compactModeRef.current
  }, [visibleTree.length, zoom])

  const colorMap = useMemo(() => buildColorMap(timesheet, colorMode, personaMap), [timesheet, colorMode, personaMap])

  const semanticStatusMap = useMemo(() => {
    const supervisors = new Set(timesheet.map(t => t.cf_supervisore).filter(Boolean))
    const out = new Map<string, 'active' | 'indirect' | 'empty'>()
    timesheet.forEach(t => {
      out.set(t.cf_dipendente, supervisors.has(t.cf_dipendente) ? 'active' : 'empty')
    })
    return out
  }, [timesheet])

  const focusPath = useMemo(() => {
    if (!focusedNode) return null
    const set = new Set<string>()
    let cur: string | null = focusedNode
    while (cur) { set.add(cur); cur = timesheet.find(t => t.cf_dipendente === cur)?.cf_supervisore ?? null }
    timesheet.filter(t => t.cf_supervisore === focusedNode).forEach(t => set.add(t.cf_dipendente))
    return set
  }, [focusedNode, timesheet])

  const hoverPath = useMemo(() => {
    if (!hoveredNode) return null
    const set = new Set<string>()
    let cur: string | null = hoveredNode
    while (cur) { set.add(cur); cur = timesheet.find(t => t.cf_dipendente === cur)?.cf_supervisore ?? null }
    timesheet.filter(t => t.cf_supervisore === hoveredNode).forEach(t => set.add(t.cf_dipendente))
    return set
  }, [hoveredNode, timesheet])

  const activePath = drillRootId ? null : (focusPath ?? hoverPath)

  // ── Drag-to-reparent ───────────────────────────────────────────────────────
  const isDescendant = useCallback((ancestorId: string, checkId: string): boolean => {
    const children = timesheet.filter(t => t.cf_supervisore === ancestorId)
    return children.some(c => c.cf_dipendente === checkId || isDescendant(c.cf_dipendente, checkId))
  }, [timesheet])

  const handleNodeDrag = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    const { x, y } = draggedNode.position
    const W = compactMode ? 160 : 220
    const H = compactMode ? 50 : 70
    const cx = x + W / 2, cy = y + H / 2
    const currentParent = timesheet.find(t => t.cf_dipendente === draggedNode.id)?.cf_supervisore
    const target = nodesRef.current.find(n => {
      if (n.id === draggedNode.id || n.type !== 'orgNode') return false
      if (n.id === currentParent) return false
      if (isDescendant(draggedNode.id, n.id)) return false
      const nx = n.position.x, ny = n.position.y
      return cx >= nx && cx <= nx + W && cy >= ny && cy <= ny + H
    })
    setDragTargetId(target?.id ?? null)
  }, [timesheet, compactMode, isDescendant])

  const handleNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (dragTargetId) {
      setPendingReparent({
        nodeId: draggedNode.id,
        nodeLabel: getLabel(draggedNode.id),
        newParentId: dragTargetId,
        newParentLabel: getLabel(dragTargetId),
      })
    }
    setDragTargetId(null)
    setDragResetKey(k => k + 1)
  }, [dragTargetId, getLabel])

  const handleConfirmReparent = useCallback(async () => {
    if (!pendingReparent) return
    setReparenting(true)
    try {
      const r = await api.timesheet.update(pendingReparent.nodeId, { cf_supervisore: pendingReparent.newParentId })
      if (r.success) {
        showToast(`${pendingReparent.nodeLabel} → ${pendingReparent.newParentLabel}`, 'success')
        await refreshAll()
      } else {
        showToast(r.error ?? 'Errore', 'error')
      }
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setReparenting(false)
      setPendingReparent(null)
    }
  }, [pendingReparent, showToast, refreshAll])

  const openDrawer = useCallback((cf: string) => {
    const p = personaMap.get(cf) ?? null
    setDrawerRecord(p); setDrawerOpen(true); setFocusedNode(cf)
  }, [personaMap])

  const collapseToRoot = useCallback(() => {
    const allCfs = new Set(timesheet.map(t => t.cf_dipendente))
    const rootIds = new Set(timesheet.filter(t => !t.cf_supervisore || !allCfs.has(t.cf_supervisore)).map(t => t.cf_dipendente))
    drillTo(null, () => {
      setCollapsedSet(new Set(timesheet.filter(t => !rootIds.has(t.cf_dipendente)).map(t => t.cf_dipendente)))
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50)
    })
  }, [timesheet, drillTo, fitView])

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const { nodes, edges } = useMemo(() => {
    const prevIds = prevVisibleIdsRef.current
    const newParentCount = new Map<string, number>()
    const nodeBoxes: NodeBox[] = visibleTree.map(tn => ({ x: tn.x, y: tn.y, w: 220, h: 90 }))

    const treeNodes = visibleTree.map(tn => {
      const cf = tn.id
      const totalChildren = childCountMap.get(cf) ?? 0
      const isCollapsed = collapsedSet.has(cf)

      const p = personaMap.get(cf)
      const colorVal = colorMode === 'societa' ? (p?.societa ?? '') : (p?.area ?? '')
      const colorScheme = colorMode !== 'none' ? colorMap.get(colorVal) : undefined
      const focusStyle: React.CSSProperties = activePath
        ? { opacity: activePath.has(cf) ? 1 : 0.2, transition: 'opacity 100ms' }
        : { transition: 'opacity 150ms' }

      const isNew = !prevIds.has(cf)
      let entranceDelay: number | undefined
      if (isNew) {
        const parentKey = tn.item.cf_supervisore ?? '__root__'
        const sibIdx = newParentCount.get(parentKey) ?? 0
        newParentCount.set(parentKey, sibIdx + 1)
        entranceDelay = sibIdx * 40
      }

      const label = getPersonaField(cf, nodeFields[0] || 'nome_completo') ?? cf
      const sublabel = nodeFields[1] ? getPersonaField(cf, nodeFields[1]) : undefined
      const extraDetail = nodeFields[2] ? getPersonaField(cf, nodeFields[2]) : undefined

      return {
        id: cf,
        type: 'orgNode',
        position: { x: tn.x, y: tn.y },
        data: {
          id: cf,
          label,
          sublabel,
          extraDetail,
          tipo: 'TIMESHEET' as const,
          collapsed: isCollapsed, hasChildren: totalChildren > 0,
          childrenCount: totalChildren, depth: tn.depth,
          isOverflowed: false, hiddenCount: 0, colorScheme,
          semanticStatus: semanticStatusMap.get(cf),
          entranceDelay, compact: compactMode,
          onExpand: () => toggleCollapse(cf),
          onExpandOverflow: () => {},
          onOpenDrawer: () => openDrawer(cf)
        },
        className: highlightedNode === cf ? 'ring-2 ring-indigo-400 rounded-lg' : undefined,
        style: focusStyle
      }
    })

    const treeEdges: Edge[] = visibleTree.filter(tn => tn.parentId).map(tn => ({
      id: `${tn.parentId}-${tn.id}`,
      source: tn.parentId!, target: tn.id,
      type: 'orgEdge', data: { nodeBoxes },
      style: { stroke: '#475569', strokeWidth: 1.5 }
    }))

    return { nodes: treeNodes as Node[], edges: treeEdges }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTree, collapsedSet, childCountMap, highlightedNode,
      toggleCollapse, colorMode, colorMap, semanticStatusMap, activePath, compactMode, openDrawer, personaMap, nodeFields, getPersonaField])

  useEffect(() => {
    prevVisibleIdsRef.current = new Set(nodes.filter(n => n.type === 'orgNode').map(n => n.id))
    nodesRef.current = nodes
  }, [nodes])

  const derivedNodes = useMemo(() => {
    if (!dragTargetId && dragResetKey === 0) return nodes
    return nodes.map(n => n.id === dragTargetId
      ? { ...n, className: 'ring-2 ring-green-400 rounded-lg' }
      : n
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, dragTargetId, dragResetKey])

  useEffect(() => {
    if (nodes.length > 0) setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timesheet, drillRootId])

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen])

  useEffect(() => {
    if (!search) { setSearchResults([]); return }
    const lower = search.toLowerCase()
    setSearchResults(timesheet.filter(t => {
      const label = getLabel(t.cf_dipendente).toLowerCase()
      return label.includes(lower) || t.cf_dipendente.toLowerCase().includes(lower)
    }).slice(0, 8))
  }, [search, timesheet, getLabel])

  const handleSelectSearchResult = useCallback((t: SupervisioneTimesheet) => {
    setSearch(getLabel(t.cf_dipendente))
    setSearchResults([])
    setHighlightedNode(t.cf_dipendente)
    const node = nodes.find(nd => nd.id === t.cf_dipendente)
    if (node) setCenter(node.position.x + 110, node.position.y + 45, { duration: 600, zoom: 1 })
    setTimeout(() => setHighlightedNode(null), 2000)
  }, [nodes, setCenter, getLabel])

  const handleFocusExpand = useCallback((nodeId: string) => {
    drillInto(nodeId, 'expand', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
    })
  }, [drillInto, fitView, getLabel])

  const handleDrillIn = useCallback((nodeId: string) => {
    drillInto(nodeId, 'navigate', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
    })
  }, [drillInto, fitView, getLabel])

  const handleNodeClick = useCallback((e: React.MouseEvent, node: Node) => {
    if (node.type !== 'orgNode') return
    setFocusedNode(node.id)
    const hasChildren = (childCountMap.get(node.id) ?? 0) > 0
    if (hasChildren) handleDrillIn(node.id)
  }, [childCountMap, handleDrillIn])

  const handleNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    if (node.type !== 'orgNode') return
    setFocusedNode(node.id)
    setContextMenu({ nodeId: node.id, x: e.clientX, y: e.clientY })
  }, [])

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== 'orgNode') return
    ;(node.data as { onOpenDrawer: () => void }).onOpenDrawer()
  }, [])

  const handlePaneClick = useCallback(() => {
    setFocusedNode(null); setDrawerOpen(false); setContextMenu(null)
  }, [])

  const clearFocus = useCallback(() => {
    setFocusedNode(null)
  }, [])

  const focusedLabel = useMemo(() => getLabel(focusedNode ?? ''), [focusedNode, getLabel])

  if (timesheet.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="text-4xl mb-3">👤</div>
        <p className="text-slate-400 font-medium">Nessuna relazione di supervisione</p>
        <p className="text-sm text-slate-500 mt-1">Importa i dati timesheet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text" placeholder="Cerca persona..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md w-52 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-10">
              {searchResults.map(t => (
                <button key={t.cf_dipendente} onClick={() => handleSelectSearchResult(t)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-700 text-sm text-slate-200">
                  <span className="font-medium">{getLabel(t.cf_dipendente)}</span>
                  <span className="text-slate-500 ml-2 text-xs">{t.cf_dipendente}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!drillRootId && (
          <>
            <button onClick={() => setCollapsedSet(new Set())}
              className="text-sm text-slate-400 hover:text-slate-200 px-2 py-1.5 hover:bg-slate-700 rounded-md transition-colors">
              Espandi tutto
            </button>
            <button onClick={collapseToRoot}
              className="text-sm text-slate-400 hover:text-slate-200 px-2 py-1.5 hover:bg-slate-700 rounded-md transition-colors">
              Comprimi tutto
            </button>
          </>
        )}

        {/* Drill breadcrumb — derivato dalla gerarchia reale */}
        {drillRootId && (
          <div className="flex items-center gap-0.5 text-sm">
            {drillBreadcrumb.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-600 mx-0.5">/</span>}
                <button
                  onClick={() => drillTo(item.id, () => { setCollapsedSet(new Set()); setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50) })}
                  className={[
                    'px-1.5 py-0.5 rounded transition-colors max-w-[120px] truncate',
                    idx === drillBreadcrumb.length - 1
                      ? 'text-slate-200 font-medium cursor-default'
                      : 'text-indigo-400 hover:text-indigo-200 hover:bg-slate-700'
                  ].join(' ')}
                >
                  {item.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Drag edit mode toggle */}
        <button
          onClick={() => { setDragEditMode(m => !m); setDragTargetId(null) }}
          className={[
            'px-2.5 py-1.5 text-xs rounded-md border transition-colors',
            dragEditMode
              ? 'bg-amber-900/50 border-amber-600 text-amber-300 font-medium'
              : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          ].join(' ')}
          title="Modalità modifica supervisore: trascina una persona su un'altra per cambiarne il supervisore"
        >
          {dragEditMode ? '✎ Modifica attiva' : '✎ Modifica supervisore'}
        </button>

        <div className="flex-1" />

        {focusedNode && !drillRootId && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-900/30 border border-indigo-700 rounded-md text-xs text-indigo-300">
            <span className="truncate max-w-[150px]">{focusedLabel}</span>
            <button onClick={clearFocus}><X className="w-3 h-3" /></button>
          </div>
        )}

        <select value={colorMode} onChange={e => setColorMode(e.target.value as ColorMode)}
          className="text-sm bg-slate-800 border border-slate-600 rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="none">Colora per…</option>
          <option value="societa">Società</option>
          <option value="area">Area</option>
        </select>

        {/* Campi nodo */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 whitespace-nowrap">Campi:</span>
          {([0, 1, 2] as const).map(i => (
            <select
              key={i}
              value={nodeFields[i]}
              onChange={e => setNodeFields(prev => { const n = [...prev] as [string,string,string]; n[i] = e.target.value; return n })}
              className="text-xs bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {NODE_FIELD_OPTIONS.filter(o => o.value === '' || o.value === nodeFields[i] || !nodeFields.includes(o.value)).map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ))}
        </div>

        <span className="text-xs text-slate-500 px-2 py-1 bg-slate-800 rounded border border-slate-700 tabular-nums">
          {compactMode ? 'Compact' : zoom <= 0.4 ? 'Macro' : zoom <= 0.8 ? 'Standard' : 'Micro'}
        </span>
      </div>

      {/* Color legend */}
      {colorMode !== 'none' && colorMap.size > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-1.5 bg-slate-900 border-b border-slate-800">
          {[...colorMap.entries()].map(([val, c]) => (
            <span key={val} className="flex items-center gap-1 text-xs text-slate-400">
              <span className="w-3 h-3 rounded-sm" style={{ background: c.border }} />
              {val || '—'}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 relative">
          <ReactFlow
            nodes={derivedNodes} edges={edges}
            nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            fitView fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1} maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={dragEditMode}
            onNodeClick={dragEditMode ? undefined : handleNodeClick}
            onNodeContextMenu={handleNodeContextMenu}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={handlePaneClick}
            onNodeMouseEnter={(_, node) => { if (node.type === 'orgNode') setHoveredNode(node.id) }}
            onNodeMouseLeave={() => setHoveredNode(null)}
            onNodeDrag={dragEditMode ? handleNodeDrag : undefined}
            onNodeDragStop={dragEditMode ? handleNodeDragStop : undefined}
            style={{ background: '#0f172a', cursor: dragEditMode ? 'grab' : undefined }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
            <Controls position="bottom-right" className="!shadow-none !border !border-slate-700 !rounded-lg overflow-hidden" />
            <MiniMap position="bottom-left" className="!border !border-slate-700 !rounded-lg"
              style={{ width: 120, height: 80, background: '#1e293b' }} nodeColor="#334155" />
          </ReactFlow>
        </div>

        {drawerOpen && (
          <div className="w-[420px] flex-shrink-0 border-l border-slate-700 bg-slate-900 overflow-y-auto">
            <RecordDrawer
              variant="panel" open={drawerOpen}
              type="persona" record={drawerRecord}
              initialMode="view"
              onClose={() => { setDrawerOpen(false); setFocusedNode(null) }}
              onSaved={refreshAll}
            />
          </div>
        )}
      </div>

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x} y={contextMenu.y}
          label={getLabel(contextMenu.nodeId)}
          hasChildren={(childCountMap.get(contextMenu.nodeId) ?? 0) > 0}
          isPinned={false}
          onPin={() => {}}
          onUnpin={() => {}}
          onFocusExpand={() => handleFocusExpand(contextMenu.nodeId)}
          onDrillIn={() => handleDrillIn(contextMenu.nodeId)}
          onOpenDetail={() => openDrawer(contextMenu.nodeId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Reparent confirmation modal */}
      {pendingReparent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-200">Modifica supervisore</h3>
            <p className="text-sm text-slate-400">
              Imposta <span className="text-slate-100 font-medium">{pendingReparent.newParentLabel}</span> come supervisore di{' '}
              <span className="text-green-300 font-medium">{pendingReparent.nodeLabel}</span>?
            </p>
            <p className="text-xs text-slate-500">
              Il campo <code className="font-mono bg-slate-800 px-1 rounded">cf_supervisore</code> verrà aggiornato nel database.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingReparent(null)} disabled={reparenting}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Annulla
              </button>
              <button onClick={handleConfirmReparent} disabled={reparenting}
                className="px-4 py-1.5 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50">
                {reparenting ? 'Aggiorno…' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag mode banner */}
      {dragEditMode && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-amber-900/80 border border-amber-600 rounded-full text-xs text-amber-200 pointer-events-none shadow-lg">
          Trascina una persona sopra un'altra per cambiarne il supervisore
        </div>
      )}
    </div>
  )
}
