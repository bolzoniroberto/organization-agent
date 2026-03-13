'use client'
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type EdgeProps,
  BackgroundVariant, useReactFlow, useViewport,
  BaseEdge, getSmoothStepPath, Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Search, X } from 'lucide-react'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import type { NodoOrganigramma, Persona } from '@/types'
import OrgNode, { type OrgNodeData } from '@/components/orgchart/OrgNode'
import OrgGroupNode from '@/components/orgchart/OrgGroupNode'
import NodeContextMenu from '@/components/orgchart/NodeContextMenu'
import RecordDrawer from '@/components/shared/RecordDrawer'
import {
  buildTree, analyzeTree, layoutTree, flattenTree, getBoundingBox,
  findWidestHorizontalSubtree, type TreeNode, type LayoutConfig
} from '@/lib/orgchart-layout'
import { useOrgDrill } from '@/lib/use-org-drill'

const NODE_TYPES = { orgNode: OrgNode, orgGroup: OrgGroupNode }
const TARGET_RATIO = 1.8   // larghezza/altezza target — forza stacking verticale aggressivo
const MAX_ITER = 5          // iterazioni massime per bilanciamento aspect ratio
const SEDE_NODE_W = 240
const SEDE_NODE_H = 100
const SEDE_PAD = 20
const SEDE_GAP = 40
const SEDE_INNER_COLS = 4

type ColorMode = 'none' | 'sede' | 'funzione' | 'tipo_nodo'

const NODE_FIELD_OPTIONS = [
  { value: '', label: '— nessuno —' },
  { value: 'nome_uo', label: 'Nome UO' },
  { value: 'cf_persona', label: 'CF Persona' },
  { value: 'centro_costo', label: 'Centro Costo' },
  { value: 'funzione', label: 'Funzione' },
  { value: 'processo', label: 'Processo' },
  { value: 'sede', label: 'Sede' },
  { value: 'job_title', label: 'Job Title' },
  { value: 'societa_org', label: 'Società' },
  { value: 'tipo_collab', label: 'Tipo Collab' },
]

const NODE_FIELD_OPTIONS_P3 = [
  ...NODE_FIELD_OPTIONS,
  { value: 'p:nome_completo', label: '👤 Nome Cognome' },
  { value: 'p:email', label: '👤 Email' },
  { value: 'p:qualifica', label: '👤 Qualifica' },
  { value: 'p:tipo_contratto', label: '👤 Tipo Contratto' },
  { value: 'p:societa', label: '👤 Società (persona)' },
  { value: 'p:area', label: '👤 Area' },
  { value: 'p:sede', label: '👤 Sede (persona)' },
  { value: 'p:data_assunzione', label: '👤 Data Assunzione' },
]

function resolveField(n: NodoOrganigramma, field: string): string | null | undefined {
  if (!field) return null
  return (n as unknown as Record<string, unknown>)[field] as string | null
}

function resolveFieldWithPersona(
  n: NodoOrganigramma,
  field: string,
  personaMap: Map<string, Persona>
): string | null | undefined {
  if (!field) return null
  if (field.startsWith('p:')) {
    const p = n.cf_persona ? personaMap.get(n.cf_persona) : null
    if (!p) return null
    const key = field.slice(2)
    if (key === 'nome_completo') return `${p.cognome ?? ''} ${p.nome ?? ''}`.trim() || null
    return (p as unknown as Record<string, unknown>)[key] as string | null
  }
  return resolveField(n, field)
}
type ColorScheme = { border: string; bg: string }
/** Semantic status: active=dipendenti diretti, indirect=solo in subtree, empty=nessuno */
function computeSemanticStatus(nodi: NodoOrganigramma[]): Map<string, 'active' | 'indirect' | 'empty'> {
  const childrenMap = new Map<string, string[]>()
  const hasDirect = new Set<string>()

  nodi.forEach(n => {
    if (n.tipo_nodo === 'PERSONA' || n.cf_persona) hasDirect.add(n.id)
    if (n.reports_to) {
      if (!childrenMap.has(n.reports_to)) childrenMap.set(n.reports_to, [])
      childrenMap.get(n.reports_to)!.push(n.id)
    }
  })

  const cache = new Map<string, boolean>()
  function hasEmpInSubtree(id: string): boolean {
    if (cache.has(id)) return cache.get(id)!
    const result = hasDirect.has(id) || (childrenMap.get(id) ?? []).some(c => hasEmpInSubtree(c))
    cache.set(id, result)
    return result
  }
  nodi.forEach(n => hasEmpInSubtree(n.id))

  const out = new Map<string, 'active' | 'indirect' | 'empty'>()
  nodi.forEach(n => {
    if (hasDirect.has(n.id)) out.set(n.id, 'active')
    else if (cache.get(n.id)) out.set(n.id, 'indirect')
    else out.set(n.id, 'empty')
  })
  return out
}

function buildColorMap(nodi: NodoOrganigramma[], mode: ColorMode): Map<string, ColorScheme> {
  if (mode === 'none') return new Map()
  const getVal = (n: NodoOrganigramma): string => {
    if (mode === 'sede') return n.sede ?? ''
    if (mode === 'funzione') return n.funzione ?? ''
    return n.tipo_nodo ?? ''
  }
  const unique = [...new Set(nodi.map(getVal).filter(Boolean))]
  return new Map(unique.map((val, i) => [
    val,
    {
      border: `hsl(${Math.round((i / unique.length) * 300)}, 55%, 55%)`,
      bg: `hsl(${Math.round((i / unique.length) * 300)}, 55%, 97%)`
    }
  ]))
}

function OrgEdge({ id, sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition: Position.Bottom,
    targetX, targetY, targetPosition: Position.Top,
    borderRadius: 6,
    offset: 20,
  })
  return <BaseEdge id={id} path={path} style={style} />
}
const EDGE_TYPES = { orgEdge: OrgEdge }

function buildSedeLayout(
  nodi: NodoOrganigramma[],
  colorMap: Map<string, ColorScheme>,
  colorMode: ColorMode,
  activePath: Set<string> | null,
  onOpenDrawer: (n: NodoOrganigramma) => void
): { nodes: Node[]; edges: Edge[] } {
  const bySede = new Map<string, NodoOrganigramma[]>()
  nodi.forEach(n => {
    const sede = n.sede ?? 'N/A'
    if (!bySede.has(sede)) bySede.set(sede, [])
    bySede.get(sede)!.push(n)
  })
  const sedeList = [...bySede.keys()]
  const sedeColors = new Map<string, ColorScheme>(sedeList.map((sede, i) => [
    sede,
    {
      border: `hsl(${Math.round((i / sedeList.length) * 300)}, 55%, 55%)`,
      bg: `hsl(${Math.round((i / sedeList.length) * 300)}, 55%, 20%)`
    }
  ]))

  let offsetX = 0
  const nodes: Node[] = []
  const edges: Edge[] = []

  bySede.forEach((items, sede) => {
    const cols = Math.min(SEDE_INNER_COLS, items.length)
    const rows = Math.ceil(items.length / SEDE_INNER_COLS)
    const groupW = SEDE_PAD * 2 + cols * SEDE_NODE_W + (cols - 1) * 12
    const groupH = 50 + rows * SEDE_NODE_H + (rows - 1) * 12
    const sedeColor = sedeColors.get(sede)!

    nodes.push({
      id: `group_${sede}`,
      type: 'orgGroup',
      position: { x: offsetX, y: 0 },
      style: { width: groupW, height: groupH },
      data: { label: sede, count: items.length, color: sedeColor.border, bgColor: '#1e293b' }
    })

    items.forEach((n, i) => {
      const getVal = (): string => {
        if (colorMode === 'sede') return n.sede ?? ''
        if (colorMode === 'funzione') return n.funzione ?? ''
        return n.tipo_nodo ?? ''
      }
      const colorScheme = colorMode !== 'none' ? colorMap.get(getVal()) : undefined
      const focusStyle: React.CSSProperties = activePath
        ? { opacity: activePath.has(n.id) ? 1 : 0.2, transition: 'opacity 150ms' }
        : {}
      nodes.push({
        id: n.id,
        type: 'orgNode',
        parentId: `group_${sede}`,
        extent: 'parent',
        position: {
          x: SEDE_PAD + (i % SEDE_INNER_COLS) * (SEDE_NODE_W + 12),
          y: 40 + Math.floor(i / SEDE_INNER_COLS) * (SEDE_NODE_H + 12)
        },
        data: {
          id: n.id,
          label: n.nome_uo ?? n.id,
          sublabel: n.cf_persona ?? n.centro_costo,
          tipo: n.tipo_nodo,
          collapsed: false, hasChildren: false, childrenCount: 0, depth: 0,
          isOverflowed: false, hiddenCount: 0,
          colorScheme,
          onExpand: () => {}, onExpandOverflow: () => {},
          onOpenDrawer: () => onOpenDrawer(n)
        },
        style: focusStyle
      })
    })
    offsetX += groupW + SEDE_GAP
  })

  // cross-sede edges only
  nodi.forEach(n => {
    if (n.reports_to) {
      const parent = nodi.find(p => p.id === n.reports_to)
      if (parent && parent.sede !== n.sede) {
        edges.push({
          id: `e_${n.reports_to}-${n.id}`,
          source: n.reports_to, target: n.id,
          style: { stroke: '#475569', strokeDasharray: '4 4' }
        })
      }
    }
  })

  return { nodes, edges }
}

export default function PosizioniCanvas() {
  const { nodi, persone, refreshAll } = useHRStore()
  const personaMap = useMemo(() => new Map(persone.map(p => [p.cf, p])), [persone])
  const filtered = useMemo(() => nodi.filter(n => !n.deleted_at), [nodi])

  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<NodoOrganigramma | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<NodoOrganigramma[]>([])
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('none')
  const [nodeFields, setNodeFields] = useState<[string, string, string]>(['nome_uo', 'cf_persona', ''])
  const [viewMode, setViewMode] = useState<'tree' | 'sede'>('tree')
  const [sedeFiltro, setSedeFiltro] = useState<string>('all')
  const [focusedNode, setFocusedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const prevVisibleIdsRef = useRef<Set<string>>(new Set())
  const compactModeRef = useRef(false)
  const { fitView, setCenter } = useReactFlow()
  const { zoom } = useViewport()
  const { drillPath, drillRootId, drillMode, drillInto, drillTo } = useOrgDrill()
  const initializedRef = useRef(false)
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [dragEditMode, setDragEditMode] = useState(false)
  const [dragTargetId, setDragTargetId] = useState<string | null>(null)
  const [dragResetKey, setDragResetKey] = useState(0)
  const [pendingReparent, setPendingReparent] = useState<{
    nodeId: string; nodeLabel: string; newParentId: string; newParentLabel: string
  } | null>(null)
  const [reparenting, setReparenting] = useState(false)
  const { showToast } = useHRStore()

  useEffect(() => {
    if (!initializedRef.current && filtered.length > 0) {
      initializedRef.current = true
      setCollapsedSet(new Set(filtered.map(n => n.id)))
    }
  }, [filtered])

  const sediList = useMemo(() => {
    const s = new Set<string>()
    filtered.forEach(n => n.sede && s.add(n.sede))
    return [...s].sort()
  }, [filtered])

  const displayNodi = useMemo(() => {
    if (sedeFiltro === 'all' || viewMode === 'sede') return filtered
    return filtered.filter(n => (n.sede?.toLowerCase() ?? '') === sedeFiltro.toLowerCase())
  }, [filtered, sedeFiltro, viewMode])

  const drilledNodi = useMemo(() => {
    if (!drillRootId) return displayNodi
    const visibleIds = new Set<string>()
    // Ancestor chain from root → drillRootId
    let cur: string | null = drillRootId
    while (cur) {
      visibleIds.add(cur)
      cur = filtered.find(n => n.id === cur)?.reports_to ?? null
    }
    if (drillMode === 'expand') {
      // Full subtree
      function collectAll(id: string) {
        filtered.filter(n => n.reports_to === id).forEach(n => { visibleIds.add(n.id); collectAll(n.id) })
      }
      collectAll(drillRootId)
    } else {
      // Direct children only
      filtered.filter(n => n.reports_to === drillRootId).forEach(n => visibleIds.add(n.id))
    }
    return filtered.filter(n => visibleIds.has(n.id))
  }, [filtered, drillRootId, drillMode, displayNodi])

  // Real child count from full dataset (for drill navigation + "has children" badge)
  const childCountMap = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(n => { if (n.reports_to) map.set(n.reports_to, (map.get(n.reports_to) ?? 0) + 1) })
    return map
  }, [filtered])

  const visibleTree = useMemo(() => {
    function filterTree(nodes: TreeNode<NodoOrganigramma>[]): TreeNode<NodoOrganigramma>[] {
      return nodes.map(n => {
        if (collapsedSet.has(n.id)) return { ...n, children: [] }
        return { ...n, children: filterTree(n.children) }
      })
    }
    const root = buildTree(drilledNodi, n => n.id, n => n.reports_to)
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
  }, [drilledNodi, collapsedSet])

  const compactMode = useMemo(() => {
    const n = visibleTree.length
    if (!compactModeRef.current && n > 50 && zoom < 0.4) compactModeRef.current = true
    else if (compactModeRef.current && (zoom > 0.4 || n < 35)) compactModeRef.current = false
    return compactModeRef.current
  }, [visibleTree.length, zoom])

  const colorMap = useMemo(() => buildColorMap(drilledNodi, colorMode), [drilledNodi, colorMode])
  const semanticStatusMap = useMemo(() => computeSemanticStatus(drilledNodi), [drilledNodi])

  const focusPath = useMemo(() => {
    if (!focusedNode) return null
    const set = new Set<string>()
    let cur: string | null = focusedNode
    while (cur) { set.add(cur); cur = filtered.find(n => n.id === cur)?.reports_to ?? null }
    filtered.filter(n => n.reports_to === focusedNode).forEach(n => set.add(n.id))
    return set
  }, [focusedNode, filtered])

  const hoverPath = useMemo(() => {
    if (!hoveredNode) return null
    const set = new Set<string>()
    let cur: string | null = hoveredNode
    while (cur) { set.add(cur); cur = filtered.find(n => n.id === cur)?.reports_to ?? null }
    filtered.filter(n => n.reports_to === hoveredNode).forEach(n => set.add(n.id))
    return set
  }, [hoveredNode, filtered])

  // When drill is active all visible nodes are already contextual — no dimming
  const activePath = drillRootId ? null : (focusPath ?? hoverPath)

  // ── Drag-to-reparent ───────────────────────────────────────────────────────
  const nodesRef = useRef<Node[]>([])

  const isDescendant = useCallback((ancestorId: string, checkId: string): boolean => {
    const children = filtered.filter(n => n.reports_to === ancestorId)
    return children.some(c => c.id === checkId || isDescendant(c.id, checkId))
  }, [filtered])

  const handleNodeDrag = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    const { x, y } = draggedNode.position
    const W = compactMode ? 160 : 220
    const H = compactMode ? 50 : 70
    const cx = x + W / 2, cy = y + H / 2
    const currentParent = filtered.find(n => n.id === draggedNode.id)?.reports_to
    const target = nodesRef.current.find(n => {
      if (n.id === draggedNode.id || n.type !== 'orgNode') return false
      if (n.id === currentParent) return false
      if (isDescendant(draggedNode.id, n.id)) return false
      const nx = n.position.x, ny = n.position.y
      return cx >= nx && cx <= nx + W && cy >= ny && cy <= ny + H
    })
    setDragTargetId(target?.id ?? null)
  }, [filtered, compactMode, isDescendant])

  const handleNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (dragTargetId) {
      const draggedNodo = filtered.find(n => n.id === draggedNode.id)
      const targetNodo = filtered.find(n => n.id === dragTargetId)
      setPendingReparent({
        nodeId: draggedNode.id,
        nodeLabel: draggedNodo?.nome_uo ?? draggedNode.id,
        newParentId: dragTargetId,
        newParentLabel: targetNodo?.nome_uo ?? dragTargetId,
      })
    }
    setDragTargetId(null)
    setDragResetKey(k => k + 1)
  }, [dragTargetId, filtered])

  const handleConfirmReparent = useCallback(async () => {
    if (!pendingReparent) return
    setReparenting(true)
    try {
      await api.org.update(pendingReparent.nodeId, { reports_to: pendingReparent.newParentId })
      showToast(`${pendingReparent.nodeLabel} → ${pendingReparent.newParentLabel}`, 'success')
      await refreshAll()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setReparenting(false)
      setPendingReparent(null)
    }
  }, [pendingReparent, showToast, refreshAll])

  const openDrawer = useCallback((n: NodoOrganigramma) => {
    setDrawerRecord(n); setDrawerOpen(true); setFocusedNode(n.id)
  }, [])

  const collapseToRoot = useCallback(() => {
    const allIds = new Set(filtered.map(n => n.id))
    const rootIds = new Set(filtered.filter(n => !n.reports_to || !allIds.has(n.reports_to)).map(n => n.id))
    drillTo(0, () => {
      setCollapsedSet(new Set(filtered.filter(n => !rootIds.has(n.id)).map(n => n.id)))
      setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50)
    })
  }, [filtered, drillTo, fitView])

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const { nodes, edges } = useMemo(() => {
    if (viewMode === 'sede') {
      return buildSedeLayout(displayNodi, colorMap, colorMode, activePath, openDrawer)
    }

    const prevIds = prevVisibleIdsRef.current
    const newParentCount = new Map<string, number>()

    const treeNodes = visibleTree.map(tn => {
      const totalChildren = childCountMap.get(tn.id) ?? 0
      const isCollapsed = collapsedSet.has(tn.id)
      const isOverflowed = false
      const hiddenCount = 0

      const getVal = (): string => {
        if (colorMode === 'sede') return tn.item.sede ?? ''
        if (colorMode === 'funzione') return tn.item.funzione ?? ''
        return tn.item.tipo_nodo ?? ''
      }
      const colorScheme = colorMode !== 'none' ? colorMap.get(getVal()) : undefined
      const focusStyle: React.CSSProperties = activePath
        ? { opacity: activePath.has(tn.id) ? 1 : 0.2, transition: 'opacity 100ms' }
        : { transition: 'opacity 150ms' }

      const isNew = !prevIds.has(tn.id)
      let entranceDelay: number | undefined
      if (isNew) {
        const parentKey = tn.item.reports_to ?? '__root__'
        const sibIdx = newParentCount.get(parentKey) ?? 0
        newParentCount.set(parentKey, sibIdx + 1)
        entranceDelay = sibIdx * 40
      }

      return {
        id: tn.id,
        type: 'orgNode',
        position: { x: tn.x, y: tn.y },
        data: {
          id: tn.id,
          label: resolveField(tn.item, nodeFields[0]) ?? tn.id,
          sublabel: resolveField(tn.item, nodeFields[1]),
          extraDetail: resolveFieldWithPersona(tn.item, nodeFields[2], personaMap),
          tipo: tn.item.tipo_nodo,
          collapsed: isCollapsed, hasChildren: totalChildren > 0,
          childrenCount: totalChildren, depth: tn.depth,
          isOverflowed, hiddenCount, colorScheme,
          semanticStatus: semanticStatusMap.get(tn.id),
          entranceDelay, compact: compactMode,
          onExpand: () => toggleCollapse(tn.id),
          onExpandOverflow: () => {},
          onOpenDrawer: () => openDrawer(tn.item)
        },
        className: highlightedNode === tn.id ? 'ring-2 ring-indigo-400 rounded-lg' : undefined,
        style: focusStyle
      }
    })

    const treeEdges: Edge[] = visibleTree.filter(tn => tn.item.reports_to).map(tn => ({
      id: `${tn.item.reports_to}-${tn.id}`,
      source: tn.item.reports_to!,
      target: tn.id,
      type: 'orgEdge',
      style: { stroke: '#475569', strokeWidth: 1.5 }
    }))

    return { nodes: treeNodes as Node[], edges: treeEdges }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, visibleTree, collapsedSet, childCountMap, highlightedNode,
      toggleCollapse, drilledNodi, colorMode, colorMap, semanticStatusMap, activePath, compactMode, openDrawer, nodeFields, personaMap])

  useEffect(() => {
    prevVisibleIdsRef.current = new Set(nodes.filter(n => n.type === 'orgNode').map(n => n.id))
    nodesRef.current = nodes
  }, [nodes])

  // Apply drag-target highlight; dragResetKey forces position reset after drag
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
  }, [displayNodi, viewMode, drillRootId])

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen])

  useEffect(() => {
    if (!search) { setSearchResults([]); return }
    const lower = search.toLowerCase()
    setSearchResults(filtered.filter(n =>
      (n.nome_uo?.toLowerCase().includes(lower)) ||
      (n.id?.toLowerCase().includes(lower)) ||
      (n.cf_persona?.toLowerCase().includes(lower))
    ).slice(0, 8))
  }, [search, filtered])

  const handleSelectSearchResult = useCallback((n: NodoOrganigramma) => {
    setSearch(n.nome_uo ?? '')
    setSearchResults([])
    setHighlightedNode(n.id)
    const node = nodes.find(nd => nd.id === n.id)
    if (node) setCenter(node.position.x + 110, node.position.y + 45, { duration: 600, zoom: 1 })
    setTimeout(() => setHighlightedNode(null), 2000)
  }, [nodes, setCenter])

  const handleFocusExpand = useCallback((nodeId: string) => {
    const nodo = filtered.find(n => n.id === nodeId)
    drillInto(nodeId, nodo?.nome_uo ?? nodeId, 'expand', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
    })
  }, [filtered, drillInto, fitView])

  const handleDrillIn = useCallback((nodeId: string) => {
    const nodo = filtered.find(n => n.id === nodeId)
    drillInto(nodeId, nodo?.nome_uo ?? nodeId, 'navigate', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
    })
  }, [filtered, drillInto, fitView])

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
    setFocusedNode(null)
    setDrawerOpen(false)
    setContextMenu(null)
  }, [])

  const clearFocus = useCallback(() => {
    setFocusedNode(null)
  }, [])

  const focusedLabel = useMemo(() =>
    filtered.find(n => n.id === focusedNode)?.nome_uo ?? focusedNode,
    [focusedNode, filtered])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="text-4xl mb-3">🏢</div>
        <p className="text-slate-400 font-medium">Nessun nodo caricato</p>
        <p className="text-sm text-slate-500 mt-1">Vai su <strong>Import → Caricamento Iniziale</strong></p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text" placeholder="Cerca nodo..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md w-52 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-10">
              {searchResults.map(n => (
                <button key={n.id} onClick={() => handleSelectSearchResult(n)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-700 text-sm text-slate-200">
                  <span className="font-medium">{n.nome_uo ?? n.id}</span>
                  <span className="text-slate-500 ml-2 text-xs">{n.id}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {viewMode === 'tree' && drillPath.length <= 1 && (
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

        {/* Drill breadcrumb */}
        {viewMode === 'tree' && drillPath.length > 1 && (
          <div className="flex items-center gap-0.5 text-sm">
            {drillPath.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-600 mx-0.5">/</span>}
                <button
                  onClick={() => drillTo(idx, () => { setCollapsedSet(new Set()); setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50) })}
                  className={[
                    'px-1.5 py-0.5 rounded transition-colors max-w-[120px] truncate',
                    idx === drillPath.length - 1
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
        {viewMode === 'tree' && (
          <button
            onClick={() => { setDragEditMode(m => !m); setDragTargetId(null) }}
            className={[
              'px-2.5 py-1.5 text-xs rounded-md border transition-colors',
              dragEditMode
                ? 'bg-amber-900/50 border-amber-600 text-amber-300 font-medium'
                : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            ].join(' ')}
            title="Modalità modifica riporti: trascina un nodo su un altro per cambiare il suo responsabile"
          >
            {dragEditMode ? '✎ Modifica attiva' : '✎ Modifica riporti'}
          </button>
        )}

        <div className="flex-1" />

        {/* Focus indicator */}
        {focusedNode && drillPath.length <= 1 && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-900/30 border border-indigo-700 rounded-md text-xs text-indigo-300">
            <span className="truncate max-w-[150px]">{focusedLabel}</span>
            <button onClick={clearFocus}><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* Color mode */}
        <select value={colorMode} onChange={e => setColorMode(e.target.value as ColorMode)}
          className="text-sm bg-slate-800 border border-slate-600 rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="none">Colora per…</option>
          <option value="sede">Sede</option>
          <option value="funzione">Funzione</option>
          <option value="tipo_nodo">Tipo Nodo</option>
        </select>

        {/* Campi nodo */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500 whitespace-nowrap">Campi:</span>
          {([0, 1, 2] as const).map(i => {
            const opts = i === 2 ? NODE_FIELD_OPTIONS_P3 : NODE_FIELD_OPTIONS
            return (
              <select
                key={i}
                value={nodeFields[i]}
                onChange={e => setNodeFields(prev => { const n = [...prev] as [string,string,string]; n[i] = e.target.value; return n })}
                className="text-xs bg-slate-800 border border-slate-600 rounded px-1.5 py-1 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {opts.filter(o => o.value === '' || o.value === nodeFields[i] || !nodeFields.includes(o.value)).map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )
          })}
        </div>

        {/* LOD badge */}
        <span className="text-xs text-slate-500 px-2 py-1 bg-slate-800 rounded border border-slate-700 tabular-nums">
          {compactMode ? 'Compact' : zoom <= 0.4 ? 'Macro' : zoom <= 0.8 ? 'Standard' : 'Micro'}
        </span>

        {/* View mode toggle */}
        <div className="flex rounded-md border border-slate-600 overflow-hidden">
          {(['tree', 'sede'] as const).map((vm, i) => (
            <button key={vm} onClick={() => setViewMode(vm)}
              className={[
                'px-3 py-1.5 text-sm transition-colors',
                i > 0 ? 'border-l border-slate-600' : '',
                viewMode === vm ? 'bg-indigo-900/50 text-indigo-300 font-medium' : 'text-slate-400 hover:bg-slate-700'
              ].join(' ')}>
              {vm === 'tree' ? 'Albero' : 'Per Sede'}
            </button>
          ))}
        </div>

        {/* Sede filter (tree only) */}
        {viewMode === 'tree' && (
          <select value={sedeFiltro} onChange={e => setSedeFiltro(e.target.value)}
            className="text-sm bg-slate-800 border border-slate-600 rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
            <option value="all">Tutte le sedi</option>
            {sediList.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </select>
        )}
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
            nodes={derivedNodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1}
            maxZoom={2}
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
              type="nodo" record={drawerRecord}
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
          label={filtered.find(n => n.id === contextMenu.nodeId)?.nome_uo ?? contextMenu.nodeId}
          hasChildren={(childCountMap.get(contextMenu.nodeId) ?? 0) > 0}
          onFocusExpand={() => handleFocusExpand(contextMenu.nodeId)}
          onDrillIn={() => handleDrillIn(contextMenu.nodeId)}
          onOpenDetail={() => { const n = filtered.find(n => n.id === contextMenu.nodeId); if (n) openDrawer(n) }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Reparent confirmation modal */}
      {pendingReparent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-200">Modifica riporto</h3>
            <p className="text-sm text-slate-400">
              Sposta <span className="text-slate-100 font-medium">{pendingReparent.nodeLabel}</span> sotto{' '}
              <span className="text-green-300 font-medium">{pendingReparent.newParentLabel}</span>?
            </p>
            <p className="text-xs text-slate-500">
              Il campo <code className="font-mono bg-slate-800 px-1 rounded">reports_to</code> verrà aggiornato nel database.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingReparent(null)}
                disabled={reparenting}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmReparent}
                disabled={reparenting}
                className="px-4 py-1.5 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {reparenting ? 'Aggiorno…' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drag mode banner */}
      {dragEditMode && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-amber-900/80 border border-amber-600 rounded-full text-xs text-amber-200 pointer-events-none shadow-lg">
          Trascina un nodo sopra un altro per cambiarne il responsabile
        </div>
      )}
    </div>
  )
}
