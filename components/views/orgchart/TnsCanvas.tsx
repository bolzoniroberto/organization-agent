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
import type { StrutturaTns } from '@/types'
import OrgNode from '@/components/orgchart/OrgNode'
import OrgGroupNode from '@/components/orgchart/OrgGroupNode'
import RecordDrawer from '@/components/shared/RecordDrawer'
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
  const { struttureTns, refreshAll } = useHRStore()
  const filtered = useMemo(() => struttureTns.filter(s => s.attivo !== 0), [struttureTns])

  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<StrutturaTns | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<StrutturaTns[]>([])
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('none')
  const [viewMode, setViewMode] = useState<'tree' | 'sede'>('tree')
  const [focusedNode, setFocusedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const prevVisibleIdsRef = useRef<Set<string>>(new Set())
  const compactModeRef = useRef(false)
  const { fitView, setCenter } = useReactFlow()
  const { zoom } = useViewport()
  const { drillPath, drillRootId, drillInto, drillTo } = useOrgDrill()
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current && filtered.length > 0) {
      initializedRef.current = true
      setCollapsedSet(new Set(filtered.map(s => s.codice)))
    }
  }, [filtered])

  // Ancestor chain + direct children only
  const drilledFiltered = useMemo(() => {
    if (!drillRootId) return filtered
    const visibleIds = new Set<string>()
    let cur: string | null = drillRootId
    while (cur) {
      visibleIds.add(cur)
      cur = filtered.find(s => s.codice === cur)?.padre ?? null
    }
    filtered.filter(s => s.padre === drillRootId).forEach(s => visibleIds.add(s.codice))
    return filtered.filter(s => visibleIds.has(s.codice))
  }, [filtered, drillRootId])

  // Real child count from full dataset
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
    const padri = new Set(filtered.map(s => s.padre).filter(Boolean))
    const out = new Map<string, 'active' | 'indirect' | 'empty'>()
    filtered.forEach(s => {
      out.set(s.codice, padri.has(s.codice) ? 'active' : 'empty')
    })
    return out
  }, [filtered])

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

  const openDrawer = useCallback((codice: string) => {
    const s = filtered.find(s => s.codice === codice) ?? null
    setDrawerRecord(s); setDrawerOpen(true); setFocusedNode(codice)
  }, [filtered])

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

      return {
        id: codice,
        type: 'orgNode',
        position: { x: tn.x, y: tn.y },
        data: {
          id: codice,
          label: s?.nome ?? codice,
          sublabel: codice,
          extraDetail: s?.titolare ?? s?.livello,
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
      toggleCollapse, filtered, colorMode, colorMap, semanticStatusMap, activePath, compactMode, openDrawer, strutturaTnsMap])

  useEffect(() => {
    prevVisibleIdsRef.current = new Set(nodes.filter(n => n.type === 'orgNode').map(n => n.id))
  }, [nodes])

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

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== 'orgNode') return
    setFocusedNode(node.id)
    const totalChildren = childCountMap.get(node.id) ?? 0
    if (totalChildren > 0) {
      const s = filtered.find(s => s.codice === node.id)
      drillInto(node.id, s?.nome ?? node.id, () => {
        setCollapsedSet(new Set())
        setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
      })
    } else {
      const s = filtered.find(s => s.codice === node.id) ?? null
      setDrawerRecord(s); setDrawerOpen(true)
    }
  }, [childCountMap, filtered, drillInto, fitView])

  const handleNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== 'orgNode') return
    ;(node.data as { onOpenDrawer: () => void }).onOpenDrawer()
  }, [])

  const handlePaneClick = useCallback(() => {
    setFocusedNode(null); setDrawerOpen(false)
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

        {drillPath.length <= 1 && (
          <>
            <button onClick={() => setCollapsedSet(new Set())}
              className="text-sm text-slate-400 hover:text-slate-200 px-2 py-1.5 hover:bg-slate-700 rounded-md transition-colors">
              Espandi tutto
            </button>
            <button onClick={() => setCollapsedSet(new Set(filtered.map(s => s.codice)))}
              className="text-sm text-slate-400 hover:text-slate-200 px-2 py-1.5 hover:bg-slate-700 rounded-md transition-colors">
              Comprimi tutto
            </button>
          </>
        )}

        {/* Drill breadcrumb */}
        {drillPath.length > 1 && (
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
            nodes={nodes} edges={edges}
            nodeTypes={NODE_TYPES} edgeTypes={EDGE_TYPES}
            fitView fitViewOptions={{ padding: 0.15 }}
            minZoom={0.1} maxZoom={2}
            proOptions={{ hideAttribution: true }}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onPaneClick={handlePaneClick}
            onNodeMouseEnter={(_, node) => { if (node.type === 'orgNode') setHoveredNode(node.id) }}
            onNodeMouseLeave={() => setHoveredNode(null)}
            style={{ background: '#0f172a' }}
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
    </div>
  )
}
