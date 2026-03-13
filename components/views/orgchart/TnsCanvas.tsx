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
import type { Persona, StrutturaTns } from '@/types'
import OrgNode from '@/components/orgchart/OrgNode'
import OrgGroupNode from '@/components/orgchart/OrgGroupNode'
import NodeContextMenu from '@/components/orgchart/NodeContextMenu'
import {
  buildTree, analyzeTree, layoutTree, flattenTree, getBoundingBox,
  findWidestHorizontalSubtree, type TreeNode, type LayoutConfig
} from '@/lib/orgchart-layout'
import { useOrgDrill } from '@/lib/use-org-drill'

const NODE_TYPES = { orgNode: OrgNode, orgGroup: OrgGroupNode }
const TARGET_RATIO = 1.8
const MAX_ITER = 5
const SEDE_NODE_W = 240
const SEDE_NODE_H = 100
const SEDE_PAD = 20
const SEDE_GAP = 40
const SEDE_INNER_COLS = 4

type ColorMode = 'none' | 'sede_tns' | 'livello'
type ColorScheme = { border: string; bg: string }
type NodeBox = { x: number; y: number; w: number; h: number }

const NODE_FIELD_OPTIONS = [
  { value: '', label: '— nessuno —' },
  { value: 'nome', label: 'Nome' },
  { value: 'codice', label: 'Codice' },
  { value: 'livello', label: 'Livello' },
  { value: 'tipo', label: 'Tipo' },
  { value: 'sede_tns', label: 'Sede TNS' },
  { value: 'titolare', label: 'Titolare' },
  { value: 'cf_titolare', label: 'CF Titolare' },
  { value: 'cdc', label: 'CdC' },
  { value: 'descrizione', label: 'Descrizione' },
]

function resolveField(s: StrutturaTns, field: string): string | null | undefined {
  if (!field) return null
  return (s as unknown as Record<string, unknown>)[field] as string | null
}

function buildColorMap(items: StrutturaTns[], mode: ColorMode): Map<string, ColorScheme> {
  if (mode === 'none') return new Map()
  const getVal = (s: StrutturaTns): string =>
    mode === 'sede_tns' ? (s.sede_tns ?? '') : (s.livello ?? '')
  const unique = [...new Set(items.map(getVal).filter(Boolean))]
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

function buildSedeLayout(
  items: StrutturaTns[],
  colorMap: Map<string, ColorScheme>,
  colorMode: ColorMode,
  activePath: Set<string> | null,
  onOpenDrawer: (codice: string) => void
): { nodes: Node[]; edges: Edge[] } {
  const bySede = new Map<string, StrutturaTns[]>()
  items.forEach(s => {
    const sede = s.sede_tns ?? 'N/A'
    if (!bySede.has(sede)) bySede.set(sede, [])
    bySede.get(sede)!.push(s)
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

  bySede.forEach((sedeItems, sede) => {
    const cols = Math.min(SEDE_INNER_COLS, sedeItems.length)
    const rows = Math.ceil(sedeItems.length / SEDE_INNER_COLS)
    const groupW = SEDE_PAD * 2 + cols * SEDE_NODE_W + (cols - 1) * 12
    const groupH = 50 + rows * SEDE_NODE_H + (rows - 1) * 12
    const sedeColor = sedeColors.get(sede)!

    nodes.push({
      id: `group_${sede}`,
      type: 'orgGroup',
      position: { x: offsetX, y: 0 },
      style: { width: groupW, height: groupH },
      data: { label: sede, count: sedeItems.length, color: sedeColor.border, bgColor: '#1e293b' }
    })

    sedeItems.forEach((s, i) => {
      const colorVal = colorMode === 'sede_tns' ? (s.sede_tns ?? '') : (s.livello ?? '')
      const colorScheme = colorMode !== 'none' ? colorMap.get(colorVal) : undefined
      const focusStyle: React.CSSProperties = activePath
        ? { opacity: activePath.has(s.codice) ? 1 : 0.2, transition: 'opacity 150ms' }
        : {}
      nodes.push({
        id: s.codice,
        type: 'orgNode',
        parentId: `group_${sede}`,
        extent: 'parent',
        position: {
          x: SEDE_PAD + (i % SEDE_INNER_COLS) * (SEDE_NODE_W + 12),
          y: 40 + Math.floor(i / SEDE_INNER_COLS) * (SEDE_NODE_H + 12)
        },
        data: {
          id: s.codice,
          label: s.nome ?? s.codice,
          sublabel: s.codice,
          tipo: 'TNS' as const,
          collapsed: false, hasChildren: false, childrenCount: 0, depth: 0,
          isOverflowed: false, hiddenCount: 0, colorScheme,
          onExpand: () => {}, onExpandOverflow: () => {},
          onOpenDrawer: () => onOpenDrawer(s.codice)
        },
        style: focusStyle
      })
    })
    offsetX += groupW + SEDE_GAP
  })

  items.forEach(s => {
    if (s.padre) {
      const parent = items.find(p => p.codice === s.padre)
      if (parent && parent.sede_tns !== s.sede_tns) {
        edges.push({
          id: `e_${s.padre}-${s.codice}`,
          source: s.padre, target: s.codice,
          style: { stroke: '#475569', strokeDasharray: '4 4' }
        })
      }
    }
  })

  return { nodes, edges }
}

export default function TnsCanvas() {
  const { struttureTns, persone, refreshAll, showToast } = useHRStore()
  const filtered = useMemo(() => struttureTns.filter(s => s.attivo !== 0 && !s.deleted_at), [struttureTns])
  const tns = useMemo(() => persone.filter((p): p is Persona & { codice_tns: string } => p.codice_tns != null), [persone])

  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<StrutturaTns | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<StrutturaTns[]>([])
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('none')
  const [nodeFields, setNodeFields] = useState<[string, string, string]>(['nome', 'codice', 'livello'])
  const [viewMode, setViewMode] = useState<'tree' | 'sede'>('tree')
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
  const nodesRef = useRef<Node[]>([])

  useEffect(() => {
    if (!initializedRef.current && filtered.length > 0) {
      initializedRef.current = true
      setCollapsedSet(new Set(filtered.map(s => s.codice)))
    }
  }, [filtered])

  const drilledFiltered = useMemo(() => {
    if (!drillRootId) return filtered
    const visibleIds = new Set<string>()
    let cur: string | null = drillRootId
    while (cur) {
      visibleIds.add(cur)
      cur = filtered.find(s => s.codice === cur)?.padre ?? null
    }
    if (drillMode === 'expand') {
      function collectAll(id: string) {
        filtered.filter(s => s.padre === id).forEach(s => { visibleIds.add(s.codice); collectAll(s.codice) })
      }
      collectAll(drillRootId)
    } else {
      filtered.filter(s => s.padre === drillRootId).forEach(s => visibleIds.add(s.codice))
    }
    return filtered.filter(s => visibleIds.has(s.codice))
  }, [filtered, drillRootId, drillMode])

  const childCountMap = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(s => { if (s.padre) map.set(s.padre, (map.get(s.padre) ?? 0) + 1) })
    return map
  }, [filtered])

  const visibleTree = useMemo(() => {
    function filterTree(nodes: TreeNode<StrutturaTns>[]): TreeNode<StrutturaTns>[] {
      return nodes.map(n => {
        if (collapsedSet.has(n.id)) return { ...n, children: [] }
        return { ...n, children: filterTree(n.children) }
      })
    }
    const root = buildTree(drilledFiltered, s => s.codice, s => s.padre ?? null)
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
  }, [drilledFiltered, collapsedSet])

  const compactMode = useMemo(() => {
    const n = visibleTree.length
    if (!compactModeRef.current && n > 50 && zoom < 0.4) compactModeRef.current = true
    else if (compactModeRef.current && (zoom > 0.4 || n < 35)) compactModeRef.current = false
    return compactModeRef.current
  }, [visibleTree.length, zoom])

  const colorMap = useMemo(() => buildColorMap(filtered, colorMode), [filtered, colorMode])

  const semanticStatusMap = useMemo(() => {
    const directCount = new Map<string, number>()
    tns.forEach(p => { directCount.set(p.codice_tns, (directCount.get(p.codice_tns) ?? 0) + 1) })
    const children = new Map<string, string[]>()
    filtered.forEach(s => {
      if (s.padre) { if (!children.has(s.padre)) children.set(s.padre, []); children.get(s.padre)!.push(s.codice) }
    })
    const subtreeCount = new Map<string, number>()
    function dfs(id: string): number {
      if (subtreeCount.has(id)) return subtreeCount.get(id)!
      const kids = children.get(id) ?? []
      const total = (directCount.get(id) ?? 0) + kids.reduce((sum, c) => sum + dfs(c), 0)
      subtreeCount.set(id, total)
      return total
    }
    filtered.forEach(s => dfs(s.codice))
    const out = new Map<string, 'active' | 'indirect' | 'empty'>()
    filtered.forEach(s => {
      const direct = directCount.get(s.codice) ?? 0
      const subtree = subtreeCount.get(s.codice) ?? 0
      out.set(s.codice, direct > 0 ? 'active' : subtree > 0 ? 'indirect' : 'empty')
    })
    return out
  }, [filtered, tns])

  const focusPath = useMemo(() => {
    if (!focusedNode) return null
    const set = new Set<string>()
    let cur: string | null = focusedNode
    while (cur) { set.add(cur); cur = filtered.find(s => s.codice === cur)?.padre ?? null }
    filtered.filter(s => s.padre === focusedNode).forEach(s => set.add(s.codice))
    return set
  }, [focusedNode, filtered])

  const hoverPath = useMemo(() => {
    if (!hoveredNode) return null
    const set = new Set<string>()
    let cur: string | null = hoveredNode
    while (cur) { set.add(cur); cur = filtered.find(s => s.codice === cur)?.padre ?? null }
    filtered.filter(s => s.padre === hoveredNode).forEach(s => set.add(s.codice))
    return set
  }, [hoveredNode, filtered])

  const activePath = drillRootId ? null : (focusPath ?? hoverPath)

  // ── Drag-to-reparent ───────────────────────────────────────────────────────
  const isDescendant = useCallback((ancestorId: string, checkId: string): boolean => {
    const children = filtered.filter(s => s.padre === ancestorId)
    return children.some(c => c.codice === checkId || isDescendant(c.codice, checkId))
  }, [filtered])

  const handleNodeDrag = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    const { x, y } = draggedNode.position
    const W = compactMode ? 160 : 220
    const H = compactMode ? 50 : 70
    const cx = x + W / 2, cy = y + H / 2
    const currentParent = filtered.find(s => s.codice === draggedNode.id)?.padre
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
      const s = filtered.find(s => s.codice === draggedNode.id)
      const target = filtered.find(s => s.codice === dragTargetId)
      setPendingReparent({
        nodeId: draggedNode.id,
        nodeLabel: s?.nome ?? draggedNode.id,
        newParentId: dragTargetId,
        newParentLabel: target?.nome ?? dragTargetId,
      })
    }
    setDragTargetId(null)
    setDragResetKey(k => k + 1)
  }, [dragTargetId, filtered])

  const handleConfirmReparent = useCallback(async () => {
    if (!pendingReparent) return
    setReparenting(true)
    try {
      const r = await api.struttureTns.setParent(pendingReparent.nodeId, pendingReparent.newParentId)
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

  const openDrawer = useCallback((codice: string) => {
    const s = filtered.find(s => s.codice === codice) ?? null
    setDrawerRecord(s); setDrawerOpen(true); setFocusedNode(codice)
  }, [filtered])

  const collapseToRoot = useCallback(() => {
    const allCodici = new Set(filtered.map(s => s.codice))
    const rootIds = new Set(filtered.filter(s => !s.padre || !allCodici.has(s.padre)).map(s => s.codice))
    drillTo(0, () => {
      setCollapsedSet(new Set(filtered.filter(s => !rootIds.has(s.codice)).map(s => s.codice)))
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

  const strutturaTnsMap = useMemo(() => {
    const m = new Map<string, StrutturaTns>()
    filtered.forEach(s => m.set(s.codice, s))
    return m
  }, [filtered])

  const { nodes, edges } = useMemo(() => {
    if (viewMode === 'sede') {
      return buildSedeLayout(filtered, colorMap, colorMode, activePath, openDrawer)
    }

    const prevIds = prevVisibleIdsRef.current
    const newParentCount = new Map<string, number>()
    const nodeBoxes: NodeBox[] = visibleTree.map(tn => ({ x: tn.x, y: tn.y, w: 220, h: 90 }))

    const treeNodes = visibleTree.map(tn => {
      const codice = tn.id
      const s = strutturaTnsMap.get(codice)
      const totalChildren = childCountMap.get(codice) ?? 0
      const isCollapsed = collapsedSet.has(codice)

      const colorVal = colorMode === 'sede_tns' ? (s?.sede_tns ?? '') : (s?.livello ?? '')
      const colorScheme = colorMode !== 'none' ? colorMap.get(colorVal) : undefined
      const focusStyle: React.CSSProperties = activePath
        ? { opacity: activePath.has(codice) ? 1 : 0.2, transition: 'opacity 100ms' }
        : { transition: 'opacity 150ms' }

      const isNew = !prevIds.has(codice)
      let entranceDelay: number | undefined
      if (isNew) {
        const parentKey = tn.item.padre ?? '__root__'
        const sibIdx = newParentCount.get(parentKey) ?? 0
        newParentCount.set(parentKey, sibIdx + 1)
        entranceDelay = sibIdx * 40
      }

      const label = s ? (resolveField(s, nodeFields[0]) ?? codice) : codice
      const sublabel = s && nodeFields[1] ? resolveField(s, nodeFields[1]) : undefined
      const extraDetail = s && nodeFields[2] ? resolveField(s, nodeFields[2]) : undefined

      return {
        id: codice,
        type: 'orgNode',
        position: { x: tn.x, y: tn.y },
        data: {
          id: codice,
          label,
          sublabel,
          extraDetail,
          tipo: 'TNS' as const,
          collapsed: isCollapsed, hasChildren: totalChildren > 0,
          childrenCount: totalChildren, depth: tn.depth,
          isOverflowed: false, hiddenCount: 0, colorScheme,
          semanticStatus: semanticStatusMap.get(codice),
          entranceDelay, compact: compactMode,
          onExpand: () => toggleCollapse(codice),
          onExpandOverflow: () => {},
          onOpenDrawer: () => openDrawer(codice)
        },
        className: highlightedNode === codice ? 'ring-2 ring-indigo-400 rounded-lg' : undefined,
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
  }, [viewMode, visibleTree, collapsedSet, childCountMap, highlightedNode,
      toggleCollapse, filtered, colorMode, colorMap, semanticStatusMap, activePath, compactMode, openDrawer, strutturaTnsMap, nodeFields])

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
  }, [filtered, viewMode, drillRootId])

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen])

  useEffect(() => {
    if (!search) { setSearchResults([]); return }
    const lower = search.toLowerCase()
    setSearchResults(filtered.filter(s =>
      (s.nome?.toLowerCase().includes(lower) ?? false) ||
      s.codice.toLowerCase().includes(lower) ||
      (s.titolare?.toLowerCase().includes(lower) ?? false)
    ).slice(0, 8))
  }, [search, filtered])

  const handleSelectSearchResult = useCallback((s: StrutturaTns) => {
    setSearch(s.nome ?? s.codice)
    setSearchResults([])
    setHighlightedNode(s.codice)
    const node = nodes.find(nd => nd.id === s.codice)
    if (node) setCenter(node.position.x + 110, node.position.y + 45, { duration: 600, zoom: 1 })
    setTimeout(() => setHighlightedNode(null), 2000)
  }, [nodes, setCenter])

  const handleFocusExpand = useCallback((nodeId: string) => {
    const s = filtered.find(s => s.codice === nodeId)
    drillInto(nodeId, s?.nome ?? nodeId, 'expand', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
    })
  }, [filtered, drillInto, fitView])

  const handleDrillIn = useCallback((nodeId: string) => {
    const s = filtered.find(s => s.codice === nodeId)
    drillInto(nodeId, s?.nome ?? nodeId, 'navigate', () => {
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
    setFocusedNode(null); setDrawerOpen(false); setContextMenu(null)
  }, [])

  const clearFocus = useCallback(() => {
    setFocusedNode(null)
  }, [])

  const focusedLabel = useMemo(() => {
    const s = filtered.find(s => s.codice === focusedNode)
    return s?.nome ?? focusedNode ?? ''
  }, [focusedNode, filtered])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <div className="text-4xl mb-3">✈️</div>
        <p className="text-slate-400 font-medium">Nessuna struttura TNS</p>
        <p className="text-sm text-slate-500 mt-1">Importa i dati strutture TNS</p>
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
            type="text" placeholder="Cerca struttura TNS..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md w-52 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-10">
              {searchResults.map(s => (
                <button key={s.codice} onClick={() => handleSelectSearchResult(s)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-700 text-sm text-slate-200">
                  <span className="font-medium">{s.nome ?? s.codice}</span>
                  <span className="text-slate-500 ml-2 text-xs">{s.codice}</span>
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
            title="Modalità modifica struttura: trascina un nodo su un altro per cambiarne il padre"
          >
            {dragEditMode ? '✎ Modifica attiva' : '✎ Modifica struttura'}
          </button>
        )}

        <div className="flex-1" />

        {focusedNode && drillPath.length <= 1 && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-900/30 border border-indigo-700 rounded-md text-xs text-indigo-300">
            <span className="truncate max-w-[150px]">{focusedLabel}</span>
            <button onClick={clearFocus}><X className="w-3 h-3" /></button>
          </div>
        )}

        <select value={colorMode} onChange={e => setColorMode(e.target.value as ColorMode)}
          className="text-sm bg-slate-800 border border-slate-600 rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500">
          <option value="none">Colora per…</option>
          <option value="sede_tns">Sede TNS</option>
          <option value="livello">Livello</option>
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

        {drawerOpen && drawerRecord && (
          <div className="w-[420px] flex-shrink-0 border-l border-slate-700 bg-slate-900 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">{drawerRecord.nome ?? drawerRecord.codice}</h2>
                  <p className="text-xs text-slate-400">{drawerRecord.codice} · {drawerRecord.livello ?? '—'}</p>
                </div>
                <button onClick={() => { setDrawerOpen(false); setFocusedNode(null) }}
                  className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <dl className="space-y-2 text-sm">
                {[
                  ['Codice', drawerRecord.codice],
                  ['Nome', drawerRecord.nome],
                  ['Padre', drawerRecord.padre],
                  ['Livello', drawerRecord.livello],
                  ['Tipo', drawerRecord.tipo],
                  ['Attivo', drawerRecord.attivo === 1 ? 'Sì' : 'No'],
                  ['CdC', drawerRecord.cdc],
                  ['Titolare', drawerRecord.titolare],
                  ['CF Titolare', drawerRecord.cf_titolare],
                  ['Sede TNS', drawerRecord.sede_tns],
                  ['Descrizione', drawerRecord.descrizione],
                ].filter(([, v]) => v != null && v !== '').map(([k, v]) => (
                  <div key={k as string} className="flex gap-2">
                    <dt className="w-28 text-slate-500 shrink-0">{k}</dt>
                    <dd className="text-slate-200 break-all">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x} y={contextMenu.y}
          label={filtered.find(s => s.codice === contextMenu.nodeId)?.nome ?? contextMenu.nodeId}
          hasChildren={(childCountMap.get(contextMenu.nodeId) ?? 0) > 0}
          onFocusExpand={() => handleFocusExpand(contextMenu.nodeId)}
          onDrillIn={() => handleDrillIn(contextMenu.nodeId)}
          onOpenDetail={() => { const s = filtered.find(s => s.codice === contextMenu.nodeId) ?? null; setDrawerRecord(s); setDrawerOpen(true) }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Reparent confirmation modal */}
      {pendingReparent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-200">Modifica struttura TNS</h3>
            <p className="text-sm text-slate-400">
              Sposta <span className="text-slate-100 font-medium">{pendingReparent.nodeLabel}</span> sotto{' '}
              <span className="text-green-300 font-medium">{pendingReparent.newParentLabel}</span>?
            </p>
            <p className="text-xs text-slate-500">
              Il campo <code className="font-mono bg-slate-800 px-1 rounded">padre</code> verrà aggiornato nel database.
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
          Trascina un nodo sopra un altro per cambiarne la struttura padre
        </div>
      )}
    </div>
  )
}
