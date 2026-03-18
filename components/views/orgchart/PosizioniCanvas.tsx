'use client'
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge,
  BackgroundVariant, useReactFlow, useViewport,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Search, X, Pin, PinOff, Printer } from 'lucide-react'
import { usePinnedViews } from '@/lib/use-pinned-views'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import type { NodoOrganigramma, Persona } from '@/types'
import OrgNode, { type OrgNodeData } from '@/components/orgchart/OrgNode'
import OrgGroupNode from '@/components/orgchart/OrgGroupNode'
import NodeContextMenu from '@/components/orgchart/NodeContextMenu'
import {
  buildTree, analyzeTree, layoutTree, flattenTree, getBoundingBox,
  findWidestHorizontalSubtree, type TreeNode, type LayoutConfig
} from '@/lib/orgchart-layout'
import { useOrgDrill } from '@/lib/use-org-drill'
import { EDGE_TYPES } from '@/components/orgchart/OrgEdge'
import TreemapView from '@/components/views/orgchart/TreemapView'
import PrintOrgChart from '@/components/views/orgchart/PrintOrgChart'
import InfoDialog from '@/components/shared/InfoDialog'
import RecordDrawer from '@/components/shared/RecordDrawer'
import { usePersistedState } from '@/lib/use-persisted-state'

const NODE_TYPES = { orgNode: OrgNode, orgGroup: OrgGroupNode }
const TARGET_RATIO = 1.8   // larghezza/altezza target — forza stacking verticale aggressivo
const MAX_ITER = 5          // iterazioni massime per bilanciamento aspect ratio
const SEDE_NODE_W = 240
const SEDE_NODE_H = 100
const SEDE_PAD = 20
const SEDE_GAP = 40
const SEDE_INNER_COLS = 4

type ColorMode = 'none' | 'sede' | 'funzione' | 'tipo_nodo'

const ALL_FIELD_OPTIONS: { group: string; fields: { value: string; label: string }[] }[] = [
  { group: 'Nodo', fields: [
    { value: '', label: '— nessuno —' },
    { value: 'nome_uo', label: 'Nome UO' },
    { value: 'cf_persona', label: 'CF Persona' },
    { value: 'centro_costo', label: 'Centro Costo' },
    { value: 'funzione', label: 'Funzione' },
    { value: 'processo', label: 'Processo' },
    { value: 'sede', label: 'Sede' },
    { value: 'job_title', label: 'Job Title' },
    { value: 'societa_org', label: 'Società Org' },
    { value: 'tipo_collab', label: 'Tipo Collab' },
  ]},
  { group: 'Persona', fields: [
    { value: 'p:nome_completo', label: 'Nome Cognome' },
    { value: 'p:cognome', label: 'Cognome' },
    { value: 'p:nome', label: 'Nome' },
    { value: 'p:email', label: 'Email' },
    { value: 'p:matricola', label: 'Matricola' },
    { value: 'p:qualifica', label: 'Qualifica' },
    { value: 'p:tipo_contratto', label: 'Tipo Contratto' },
    { value: 'p:societa', label: 'Società' },
    { value: 'p:area', label: 'Area' },
    { value: 'p:sotto_area', label: 'Sotto Area' },
    { value: 'p:sede', label: 'Sede (persona)' },
    { value: 'p:cdc_amministrativo', label: 'CDC Amm.' },
    { value: 'p:data_assunzione', label: 'Data Assunzione' },
    { value: 'p:data_fine_rapporto', label: 'Data Fine Rapporto' },
    { value: 'p:livello', label: 'Livello' },
    { value: 'p:ral', label: 'RAL' },
    { value: 'p:modalita_presenze', label: 'Modalità Presenze' },
    { value: 'p:part_time', label: 'Part Time' },
  ]},
  { group: 'TNS', fields: [
    { value: 'p:codice_tns', label: 'Codice TNS' },
    { value: 'p:padre_tns', label: 'Padre TNS' },
    { value: 'p:livello_tns', label: 'Livello TNS' },
    { value: 'p:sede_tns', label: 'Sede TNS' },
    { value: 'p:cdc_tns', label: 'CDC TNS' },
    { value: 'p:titolare_tns', label: 'Titolare TNS' },
    { value: 'p:ruoli_tns_desc', label: 'Ruoli TNS' },
  ]},
]
const ALL_FIELD_FLAT = ALL_FIELD_OPTIONS.flatMap(g => g.fields)

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
  const { nodi, persone, refreshAll, hasDismissedReadabilityAlert, dismissReadabilityAlert } = useHRStore()
  const personaMap = useMemo(() => new Map(persone.map(p => [p.cf, p])), [persone])
  const filtered = useMemo(() => nodi.filter(n => !n.deleted_at), [nodi])

  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showReadabilityAlert, setShowReadabilityAlert] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<NodoOrganigramma | null>(null)
  const [drawerInitialMode, setDrawerInitialMode] = useState<'view' | 'edit'>('view')
  const [pendingAssign, setPendingAssign] = useState<{
    nodeId: string; nodeLabel: string; cf: string; personName: string; existingCf?: string; existingName?: string
  } | null>(null)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<NodoOrganigramma[]>([])
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [colorMode, setColorMode] = useState<ColorMode>('none')
  const [nodeFields, setNodeFields] = usePersistedState<[string, string, string]>('orgchart:posizioni:nodeFields', ['nome_uo', 'cf_persona', ''])
  const [viewMode, setViewMode] = useState<'tree' | 'sede'>('tree')
  const [visualMode, setVisualMode] = useState<'flow' | 'treemap'>('flow')
  const [sedeFiltro, setSedeFiltro] = useState<string>('all')
  const [focusedNode, setFocusedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const prevVisibleIdsRef = useRef<Set<string>>(new Set())
  const compactModeRef = useRef(false)
  const [leftPanelWidth, setLeftPanelWidth] = useState(240)
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false)

  useEffect(() => {
    if (!isResizingLeftPanel) return
    const handleMouseMove = (e: MouseEvent) => {
      setLeftPanelWidth(Math.max(200, Math.min(e.clientX, 600)))
    }
    const handleMouseUp = () => setIsResizingLeftPanel(false)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingLeftPanel])
  const { fitView, setCenter } = useReactFlow()
  const { zoom } = useViewport()
  const { drillRootId, drillMode, drillInto, drillTo } = useOrgDrill()

  const drillBreadcrumb = useMemo(() => {
    const items: { id: string | null; label: string }[] = [{ id: null, label: 'Radice' }]
    if (!drillRootId) return items
    const ancestors: { id: string; label: string }[] = []
    let cur: string | null = drillRootId
    while (cur) {
      const n = filtered.find(n => n.id === cur)
      if (!n) break
      ancestors.unshift({ id: cur, label: n.nome_uo ?? cur })
      cur = n.reports_to ?? null
    }
    return [...items, ...ancestors]
  }, [drillRootId, filtered])
  const initializedRef = useRef(false)
  const [contextMenu, setContextMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null)
  const [dragEditMode, setDragEditMode] = useState(false)
  const [dragTargetId, setDragTargetId] = useState<string | null>(null)
  const [dragResetKey, setDragResetKey] = useState(0)
  const [pendingReparent, setPendingReparent] = useState<{
    nodeId: string; nodeLabel: string; newParentId: string; newParentLabel: string
  } | null>(null)
  const [reparenting, setReparenting] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<{ nodeId: string; label: string } | null>(null)
  const [pendingHardDelete, setPendingHardDelete] = useState<{ nodeId: string; label: string } | null>(null)
  const [nodeActionLoading, setNodeActionLoading] = useState(false)
  const [showUnassigned, setShowUnassigned] = useState(false)
  const [unassignedSearch, setUnassignedSearch] = useState('')
  const [showAssigned, setShowAssigned] = useState(false)
  const [assignedSearch, setAssignedSearch] = useState('')
  const [pendingMultiAssign, setPendingMultiAssign] = useState<{
    cf: string; personName: string
    targetNodeId: string; targetNodeLabel: string
    sourceNodeIds: string[]
    targetExistingCf?: string; targetExistingName?: string
  } | null>(null)
  const [multiAssignLoading, setMultiAssignLoading] = useState(false)
  const [groupByName, setGroupByName] = useState(false)
  const [leafListMode, setLeafListMode] = useState(false)
  const [showFieldsPanel, setShowFieldsPanel] = useState(false)
  const [pinsExpanded, setPinsExpanded] = useState(true)
  const pinClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (pinClickTimer.current) clearTimeout(pinClickTimer.current) }, [])
  const { showToast } = useHRStore()
  const { pins, addPin, removePin, updatePin, isPinned } = usePinnedViews()

  const [printMode, setPrintMode] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [activePrintPin, setActivePrintPin] = useState<string | null>(null)

  const personeNonAssegnate = useMemo(() => {
    const cfInNodi = new Set(filtered.map(n => n.cf_persona).filter(Boolean) as string[])
    return persone
      .filter(p => !p.deleted_at && !cfInNodi.has(p.cf))
      .sort((a, b) => (a.cognome ?? '').localeCompare(b.cognome ?? ''))
  }, [persone, filtered])

  const personeNonAssegnateFiltrate = useMemo(() => {
    if (!unassignedSearch) return personeNonAssegnate
    const lower = unassignedSearch.toLowerCase()
    return personeNonAssegnate.filter(p =>
      p.cf.toLowerCase().includes(lower) ||
      p.cognome?.toLowerCase().includes(lower) ||
      p.nome?.toLowerCase().includes(lower)
    )
  }, [personeNonAssegnate, unassignedSearch])

  const personeAssegnate = useMemo(() => {
    const cfInNodi = new Set(filtered.map(n => n.cf_persona).filter(Boolean) as string[])
    return persone
      .filter(p => !p.deleted_at && cfInNodi.has(p.cf))
      .sort((a, b) => (a.cognome ?? '').localeCompare(b.cognome ?? ''))
  }, [persone, filtered])

  const personeAssegnateFiltrate = useMemo(() => {
    if (!assignedSearch) return personeAssegnate
    const lower = assignedSearch.toLowerCase()
    return personeAssegnate.filter(p =>
      p.cf.toLowerCase().includes(lower) ||
      p.cognome?.toLowerCase().includes(lower) ||
      p.nome?.toLowerCase().includes(lower)
    )
  }, [personeAssegnate, assignedSearch])

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

  // ── Raggruppamento nodi con stesso nome UO (solo foglie) ──────────────────────
  const [groupedNodiResult, groupedPersonsMap] = useMemo((): [NodoOrganigramma[], Map<string, NodoOrganigramma[]>] => {
    if (!groupByName) return [drilledNodi, new Map()]
    // hasChildrenSet dal dataset COMPLETO: un responsabile che ha figli fuori dal drill corrente
    // non deve essere raggruppato con le persone semplici della stessa UO
    const hasChildrenInFull = new Set(filtered.map(n => n.reports_to).filter(Boolean) as string[])
    const grouped = new Map<string, NodoOrganigramma[]>()
    const branches: NodoOrganigramma[] = []
    drilledNodi.forEach(n => {
      if (hasChildrenInFull.has(n.id)) {
        branches.push(n)
      } else {
        const key = `${n.reports_to ?? '__ROOT__'}|||${n.nome_uo ?? n.id}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(n)
      }
    })
    const result: NodoOrganigramma[] = [...branches]
    const gpMap = new Map<string, NodoOrganigramma[]>()
    grouped.forEach((group) => {
      if (group.length === 1) {
        result.push(group[0])
      } else {
        const first = group[0]
        const safeName = (first.nome_uo ?? first.id).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
        const virtualId = `grp_${first.reports_to ?? 'root'}_${safeName}`
        result.push({ ...first, id: virtualId })
        gpMap.set(virtualId, group)
      }
    })
    return [result, gpMap]
  }, [drilledNodi, groupByName, filtered])

  const visibleTree = useMemo(() => {
    function filterTree(nodes: TreeNode<NodoOrganigramma>[]): TreeNode<NodoOrganigramma>[] {
      return nodes.map(n => {
        if (collapsedSet.has(n.id)) return { ...n, children: [] }
        return { ...n, children: filterTree(n.children) }
      })
    }
    const root = buildTree(groupedNodiResult, n => n.id, n => n.reports_to)
    const metrics = analyzeTree(root)

    // ── Dynamic vGap: prevent overlap when nodes are taller than default ────────
    let vGap = 130
    if (leafListMode || groupByName) {
      const childrenOfId = new Map<string, string[]>()
      groupedNodiResult.forEach(n => {
        if (n.reports_to) {
          if (!childrenOfId.has(n.reports_to)) childrenOfId.set(n.reports_to, [])
          childrenOfId.get(n.reports_to)!.push(n.id)
        }
      })
      let maxNodeHeight = 80
      if (leafListMode) {
        childrenOfId.forEach((children, _) => {
          if (children.every(c => !childrenOfId.has(c))) {
            // all-leaf parent → becomes leafList node
            const listH = Math.min(children.length * 22 + 20, 212)
            maxNodeHeight = Math.max(maxNodeHeight, 80 + listH)
          }
        })
      }
      if (groupByName) {
        groupedPersonsMap.forEach(g => {
          const listH = Math.min(g.length * 20 + 10, 154)
          maxNodeHeight = Math.max(maxNodeHeight, 80 + listH)
        })
      }
      vGap = Math.max(130, maxNodeHeight + 20)
    }

    const cfg: LayoutConfig = {
      gridCols: metrics.dynamicGridCols,
      verticalStackingDepth: metrics.useVerticalStacking ? 7 : null,
      forcedVerticalNodes: new Set(),
      vGap,
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
  }, [groupedNodiResult, collapsedSet, leafListMode, groupByName, groupedPersonsMap])

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

  // ── Ancestor collapse ────────────────────────────────────────────────────────
  // All ancestor IDs of drillRootId (root → parent), used to collapse into breadcrumb chip
  const drillAncestorSet = useMemo((): Set<string> => {
    if (!drillRootId) return new Set()
    const s = new Set<string>()
    let cur = filtered.find(n => n.id === drillRootId)?.reports_to ?? null
    while (cur) { s.add(cur); cur = filtered.find(n => n.id === cur)?.reports_to ?? null }
    return s
  }, [drillRootId, filtered])

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

  const handleConfirmRemove = useCallback(async () => {
    if (!pendingRemove) return
    setNodeActionLoading(true)
    try {
      await api.org.delete(pendingRemove.nodeId)
      showToast(`Nodo "${pendingRemove.label}" rimosso`, 'success')
      await refreshAll()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setNodeActionLoading(false)
      setPendingRemove(null)
    }
  }, [pendingRemove, showToast, refreshAll])

  const handleConfirmHardDelete = useCallback(async () => {
    if (!pendingHardDelete) return
    setNodeActionLoading(true)
    try {
      await api.org.hardDelete(pendingHardDelete.nodeId)
      showToast(`Nodo "${pendingHardDelete.label}" eliminato`, 'success')
      await refreshAll()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setNodeActionLoading(false)
      setPendingHardDelete(null)
    }
  }, [pendingHardDelete, showToast, refreshAll])

  const openDrawer = useCallback((n: NodoOrganigramma, mode: 'view' | 'edit' = 'view') => {
    setDrawerRecord(n); setDrawerInitialMode(mode); setDrawerOpen(true); setFocusedNode(n.id)
  }, [])

  const collapseToRoot = useCallback(() => {
    const allIds = new Set(filtered.map(n => n.id))
    const rootIds = new Set(filtered.filter(n => !n.reports_to || !allIds.has(n.reports_to)).map(n => n.id))
    drillTo(null, () => {
      setCollapsedSet(new Set(filtered.filter(n => !rootIds.has(n.id)).map(n => n.id)))
      setTimeout(() => fitView({ padding: 0.2, duration: 400, minZoom: 0.7 }), 50)
    })
  }, [filtered, drillTo, fitView])

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const handleDropPersonOnNode = useCallback((nodeId: string, cf: string) => {
    const nodo = filtered.find(n => n.id === nodeId)
    if (!nodo) return
    const persona = persone.find(p => p.cf === cf)
    if (!persona) return
    const personName = `${persona.cognome ?? ''} ${persona.nome ?? ''}`.trim() || cf

    // Controlla se la persona è già assegnata ad altri nodi attivi
    const sourceNodes = filtered.filter(n => n.cf_persona === cf && n.id !== nodeId)
    if (sourceNodes.length > 0) {
      const targetExistingP = nodo.cf_persona && nodo.cf_persona !== cf
        ? persone.find(p => p.cf === nodo.cf_persona)
        : undefined
      const targetExistingName = targetExistingP
        ? `${targetExistingP.cognome ?? ''} ${targetExistingP.nome ?? ''}`.trim()
        : nodo.cf_persona ?? undefined
      setPendingMultiAssign({
        cf, personName,
        targetNodeId: nodeId, targetNodeLabel: nodo.nome_uo ?? nodeId,
        sourceNodeIds: sourceNodes.map(n => n.id),
        targetExistingCf: nodo.cf_persona && nodo.cf_persona !== cf ? nodo.cf_persona : undefined,
        targetExistingName,
      })
      return
    }

    if (nodo.cf_persona && nodo.cf_persona !== cf) {
      const existingP = persone.find(p => p.cf === nodo.cf_persona)
      const existingName = existingP ? `${existingP.cognome ?? ''} ${existingP.nome ?? ''}`.trim() : nodo.cf_persona
      setPendingAssign({ nodeId, nodeLabel: nodo.nome_uo ?? nodeId, cf, personName, existingCf: nodo.cf_persona, existingName })
    } else {
      setPendingAssign({ nodeId, nodeLabel: nodo.nome_uo ?? nodeId, cf, personName })
    }
  }, [filtered, persone])

  const handleConfirmAssign = useCallback(async () => {
    if (!pendingAssign) return
    try {
      await api.org.update(pendingAssign.nodeId, { cf_persona: pendingAssign.cf })
      showToast(`${pendingAssign.personName} assegnato a ${pendingAssign.nodeLabel}`, 'success')
      await refreshAll()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setPendingAssign(null)
    }
  }, [pendingAssign, showToast, refreshAll])

  const handleConfirmMultiAssign = useCallback(async (mode: 'add' | 'move') => {
    if (!pendingMultiAssign) return
    setMultiAssignLoading(true)
    try {
      if (mode === 'move') {
        // Rimuovi la persona da tutti i nodi sorgente
        await Promise.all(pendingMultiAssign.sourceNodeIds.map(id =>
          api.org.update(id, { cf_persona: null })
        ))
      }
      // Assegna al nodo target
      await api.org.update(pendingMultiAssign.targetNodeId, { cf_persona: pendingMultiAssign.cf })
      showToast(
        mode === 'move'
          ? `${pendingMultiAssign.personName} spostato in ${pendingMultiAssign.targetNodeLabel}`
          : `${pendingMultiAssign.personName} associato anche a ${pendingMultiAssign.targetNodeLabel}`,
        'success'
      )
      await refreshAll()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setMultiAssignLoading(false)
      setPendingMultiAssign(null)
    }
  }, [pendingMultiAssign, showToast, refreshAll])

  const pendingOpenNodeIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pendingOpenNodeIdRef.current) return
    const node = filtered.find(n => n.id === pendingOpenNodeIdRef.current)
    if (node) {
      pendingOpenNodeIdRef.current = null
      openDrawer(node, 'edit')
    }
  }, [filtered, openDrawer])

  const handleCreateChildNode = useCallback(async (parentId: string) => {
    const parent = filtered.find(n => n.id === parentId)
    if (!parent) return
    try {
      const res = await api.org.suggestId(parentId)
      if (!res.id) { showToast(res.error ?? 'Errore suggest-id', 'error'); return }
      const cr = await api.org.create({
        id: res.id,
        reports_to: parentId,
        nome_uo: parent.nome_uo ?? undefined,
        tipo_nodo: 'STRUTTURA',
      })
      if (!cr.success) { showToast(cr.error ?? 'Errore creazione', 'error'); return }
      pendingOpenNodeIdRef.current = res.id
      await refreshAll()
    } catch (e) {
      showToast(String(e), 'error')
    }
  }, [filtered, showToast, refreshAll])

  const { nodes, edges } = useMemo(() => {
    if (viewMode === 'sede') {
      return buildSedeLayout(displayNodi, colorMap, colorMode, activePath, openDrawer)
    }

    const prevIds = prevVisibleIdsRef.current
    const newParentCount = new Map<string, number>()

    // ── leafListMode: mappa parent → figli foglia da assorbire ────────────────
    const childrenOf = new Map<string, Array<TreeNode<NodoOrganigramma>>>()
    visibleTree.forEach(tn => {
      if (tn.item.reports_to) {
        const arr = childrenOf.get(tn.item.reports_to) ?? []
        arr.push(tn)
        childrenOf.set(tn.item.reports_to, arr)
      }
    })
    const leafListMap = new Map<string, Array<TreeNode<NodoOrganigramma>>>()
    if (leafListMode) {
      visibleTree.forEach(tn => {
        const children = childrenOf.get(tn.id) ?? []
        if (
          children.length > 0 &&
          children.every(c => (childrenOf.get(c.id)?.length ?? 0) === 0) &&
          children.every(c => !groupedPersonsMap.has(c.id)) // non assorbire nodi gruppo virtuale
        ) {
          leafListMap.set(tn.id, children)
        }
      })
    }
    const absorbedIds = new Set<string>()
    leafListMap.forEach(children => children.forEach(c => absorbedIds.add(c.id)))

    const treeNodes = visibleTree
      .filter(tn => !absorbedIds.has(tn.id))
      .map(tn => {
        const totalChildren = childCountMap.get(tn.id) ?? 0
        const isCollapsed = collapsedSet.has(tn.id)

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

        const leafListChildren = leafListMap.get(tn.id)
        const leafList = leafListChildren?.map(child => ({
          id: child.id,
          label: resolveFieldWithPersona(child.item, nodeFields[0], personaMap) ?? child.id,
          sublabel: resolveFieldWithPersona(child.item, nodeFields[1], personaMap) ?? undefined,
          tipo: child.item.tipo_nodo,
          onOpenDrawer: () => openDrawer(child.item)
        }))

        const gpList = groupedPersonsMap.get(tn.id)
        const groupedPersons = gpList?.map(n => ({
          id: n.id,
          // Label sempre = nome persona (ignora nodeFields[0] che sarebbe la stessa UO per tutti)
          label: resolveFieldWithPersona(n, 'p:nome_completo', personaMap)
            ?? resolveFieldWithPersona(n, nodeFields[0], personaMap)
            ?? n.id,
          sublabel: resolveFieldWithPersona(n, nodeFields[1], personaMap) ?? undefined,
          onOpenDrawer: () => openDrawer(n)
        }))

        const hasChildrenFlag = leafList ? false : totalChildren > 0
        const childrenCountVal = leafList ? leafListChildren!.length : totalChildren

        return {
          id: tn.id,
          type: 'orgNode',
          position: { x: tn.x, y: tn.y },
          data: {
            id: tn.id,
            label: resolveFieldWithPersona(tn.item, nodeFields[0], personaMap) ?? tn.id,
            sublabel: gpList ? `${gpList.length} persone` : resolveFieldWithPersona(tn.item, nodeFields[1], personaMap),
            extraDetail: resolveFieldWithPersona(tn.item, nodeFields[2], personaMap),
            tipo: tn.item.tipo_nodo,
            collapsed: leafList ? false : isCollapsed,
            hasChildren: hasChildrenFlag,
            childrenCount: childrenCountVal,
            depth: tn.depth,
            isOverflowed: false, hiddenCount: 0, colorScheme,
            semanticStatus: semanticStatusMap.get(tn.id),
            alertDots: isPinned(tn.id) ? [{ color: 'yellow', title: 'Vista fissata' }] : undefined,
            entranceDelay, compact: compactMode,
            isAncestor: drillAncestorSet.has(tn.id),
            onExpand: () => toggleCollapse(tn.id),
            onExpandOverflow: () => {},
            onOpenDrawer: () => openDrawer(tn.item),
            onDropPerson: (cf: string) => handleDropPersonOnNode(tn.id, cf),
            leafList,
            groupedPersons,
          },
          className: highlightedNode === tn.id ? 'ring-2 ring-indigo-400 rounded-lg' : undefined,
          style: focusStyle
        }
      })

    const treeEdges: Edge[] = visibleTree
      .filter(tn => tn.item.reports_to && !absorbedIds.has(tn.id))
      .map(tn => ({
        id: `${tn.item.reports_to}-${tn.id}`,
        source: tn.item.reports_to!,
        target: tn.id,
        type: 'orgEdge',
        style: { stroke: '#475569', strokeWidth: 1.5 }
      }))

    // ── Collapse ancestors into single breadcrumb chip ──────────────────────
    if (drillAncestorSet.size >= 2) {
      const drillRootTN = visibleTree.find(n => n.id === drillRootId)
      if (drillRootTN) {
        // Build ancestor chain in root→parent order
        const chain: string[] = []
        let c: string | null = drillRootTN.item.reports_to ?? null
        while (c) { chain.unshift(c); c = filtered.find(n => n.id === c)?.reports_to ?? null }
        const breadcrumbLabel = chain.map(id => {
          const item = filtered.find(n => n.id === id)
          return item ? (resolveFieldWithPersona(item, nodeFields[0], personaMap) ?? id) : id
        }).join(' › ')
        const lastAncestor = filtered.find(n => n.id === chain[chain.length - 1])
        const crumbNode: Node = {
          id: '__ancestors__',
          type: 'orgNode',
          position: { x: drillRootTN.x, y: drillRootTN.y - 80 },
          data: {
            id: '__ancestors__',
            label: breadcrumbLabel,
            tipo: 'STRUTTURA' as const,
            collapsed: false, hasChildren: false, childrenCount: 0,
            depth: 0, isOverflowed: false, hiddenCount: 0,
            isAncestor: true,
            onExpand: () => {}, onExpandOverflow: () => {},
            onOpenDrawer: lastAncestor ? () => openDrawer(lastAncestor) : () => {},
          } as unknown as Record<string, unknown>,
        }
        const filteredNodes = treeNodes.filter(n => !drillAncestorSet.has(n.id))
        const ancEdge: Edge = { id: `__anc__-${drillRootId!}`, source: '__ancestors__', target: drillRootId!, type: 'orgEdge', style: { stroke: '#475569', strokeWidth: 1.5 } }
        const filteredEdges = treeEdges
          .filter(e => !drillAncestorSet.has(e.source) && !drillAncestorSet.has(e.target))
          .concat([ancEdge])
        return { nodes: [...filteredNodes, crumbNode] as Node[], edges: filteredEdges }
      }
    }

    return { nodes: treeNodes as Node[], edges: treeEdges }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, visibleTree, collapsedSet, childCountMap, highlightedNode,
      toggleCollapse, colorMode, colorMap, semanticStatusMap, activePath, compactMode,
      openDrawer, nodeFields, personaMap, isPinned, leafListMode, groupedPersonsMap, handleDropPersonOnNode,
      drillAncestorSet, drillRootId, filtered])

  // Trigger readability alert if tree grows too big
  useEffect(() => {
    if (viewMode === 'tree' && visualMode === 'flow' && !hasDismissedReadabilityAlert && nodes.length > 150) {
      setShowReadabilityAlert(true)
    }
  }, [nodes.length, viewMode, visualMode, hasDismissedReadabilityAlert])

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
    if (nodes.length > 0) setTimeout(() => fitView({ padding: 0.15, duration: 400, minZoom: 0.7 }), 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayNodi, viewMode, drillRootId])

  useEffect(() => {
    setTimeout(() => fitView({ padding: 0.15, duration: 300, minZoom: 0.7 }), 50)
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
    drillInto(nodeId, 'expand', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400, minZoom: 0.7 }), 50)
    })
  }, [drillInto, fitView])

  const handleDrillIn = useCallback((nodeId: string) => {
    drillInto(nodeId, 'navigate', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400, minZoom: 0.7 }), 50)
    })
  }, [drillInto, fitView])

  const handleExportPdf = useCallback(async () => {
    if (pins.length === 0) return
    setPdfExporting(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const html2canvas = (await import('html2canvas')).default

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pdfW = pdf.internal.pageSize.getWidth()
      const pdfH = pdf.internal.pageSize.getHeight()

      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i]
        const container = document.createElement('div')
        container.style.cssText = 'position:fixed;left:-9999px;top:0;background:white'
        document.body.appendChild(container)
        const root = createRoot(container)
        root.render(
          <PrintOrgChart
            allNodes={filtered}
            personeMap={personaMap}
            rootId={pin.id}
            maxDepth={pin.maxDepth ?? 3}
            nodePositions={pin.nodePositions ?? {}}
            interactive={false}
          />
        )
        await new Promise(r => setTimeout(r, 300))
        const canvas = await html2canvas(container, { scale: 2, backgroundColor: '#ffffff' })
        const imgData = canvas.toDataURL('image/jpeg', 0.92)
        if (i > 0) pdf.addPage()
        const ratio = Math.min(pdfW / (canvas.width / 2), pdfH / (canvas.height / 2))
        const w = (canvas.width / 2) * ratio
        const h = (canvas.height / 2) * ratio
        pdf.addImage(imgData, 'JPEG', (pdfW - w) / 2, (pdfH - h) / 2, w, h)
        root.unmount()
        document.body.removeChild(container)
      }

      pdf.save(`organigramma-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setPdfExporting(false)
    }
  }, [pins, filtered, personaMap, showToast])

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

        {viewMode === 'tree' && !drillRootId && (
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

        {/* Visual Mode Toggle (Flow vs Treemap) */}
        {viewMode === 'tree' && (
          <div className="flex bg-slate-800 p-0.5 rounded-md border border-slate-700">
            <button
              onClick={() => setVisualMode('flow')}
              className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                visualMode === 'flow' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              Organigramma
            </button>
            <button
              onClick={() => setVisualMode('treemap')}
              className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                visualMode === 'treemap' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              Treemap
            </button>
          </div>
        )}

        {viewMode === 'tree' && visualMode === 'flow' && (
          <>
            <button onClick={() => setGroupByName(g => !g)}
              className={[
                'px-2.5 py-1.5 text-xs rounded-md border transition-colors',
                groupByName
                  ? 'bg-violet-900/50 border-violet-600 text-violet-300 font-medium'
                  : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              ].join(' ')}
              title="Raggruppa nodi foglia con lo stesso nome UO in una singola card">
              ⊞ Raggruppa UO
            </button>
            <button onClick={() => setLeafListMode(m => !m)}
              className={[
                'px-2.5 py-1.5 text-xs rounded-md border transition-colors',
                leafListMode
                  ? 'bg-teal-900/50 border-teal-600 text-teal-300 font-medium'
                  : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              ].join(' ')}
              title="Mostra le foglie come lista inline nel nodo padre (risparmia larghezza)">
              ≡ Lista foglie
            </button>
          </>
        )}

        {/* Drill breadcrumb — derivato dalla gerarchia reale */}
        {viewMode === 'tree' && drillRootId && (
          <div className="flex items-center gap-0.5 text-sm">
            {drillBreadcrumb.map((item, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-600 mx-0.5">/</span>}
                <button
                  onClick={() => drillTo(item.id, () => { setCollapsedSet(new Set()); setTimeout(() => fitView({ padding: 0.15, duration: 400, minZoom: 0.7 }), 50) })}
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

        {/* Vista stampa */}
        <button
          onClick={() => { setPrintMode(p => !p); setActivePrintPin(null) }}
          className={[
            'flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors',
            printMode
              ? 'bg-emerald-900/50 border-emerald-600 text-emerald-300 font-medium'
              : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
          ].join(' ')}
          title="Vista stampa / esportazione PDF"
        >
          <Printer className="w-3.5 h-3.5" />
          {printMode ? 'Esci da stampa' : 'Vista stampa'}
        </button>

        <div className="flex-1" />

        {/* Focus indicator */}
        {focusedNode && !drillRootId && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-900/30 border border-indigo-700 rounded-md text-xs text-indigo-300">
            <span className="truncate max-w-[150px]">{focusedLabel}</span>
            <button onClick={clearFocus}><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* Campi nodo — checkbox panel */}
        <div className="relative">
          <button
            onClick={() => setShowFieldsPanel(p => !p)}
            className={[
              'px-2.5 py-1.5 text-xs rounded-md border transition-colors whitespace-nowrap',
              showFieldsPanel
                ? 'bg-indigo-900/50 border-indigo-600 text-indigo-300 font-medium'
                : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
            ].join(' ')}
          >
            Campi ({nodeFields.filter(Boolean).length}/3)
          </button>
          {showFieldsPanel && (
            <div className="absolute top-full right-0 mt-1 w-64 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-20 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">Seleziona fino a 3 campi</span>
                <button onClick={() => setNodeFields(['nome_uo', 'cf_persona', ''])} className="text-xs text-slate-500 hover:text-slate-300">reset</button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {ALL_FIELD_OPTIONS.map(group => (
                  <div key={group.group}>
                    <div className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-900/50 sticky top-0">
                      {group.group}
                    </div>
                    {group.fields.filter(f => f.value !== '').map(field => {
                      const slotIdx = nodeFields.indexOf(field.value)
                      const isSelected = slotIdx !== -1
                      const canSelect = !isSelected && nodeFields.filter(Boolean).length < 3
                      return (
                        <button
                          key={field.value}
                          disabled={!isSelected && !canSelect}
                          onClick={() => {
                            if (isSelected) {
                              const n = [...nodeFields] as [string,string,string]; n[slotIdx] = ''; setNodeFields(n)
                            } else if (canSelect) {
                              const n = [...nodeFields] as [string,string,string]
                              const emptySlot = n.indexOf('')
                              if (emptySlot !== -1) { n[emptySlot] = field.value; setNodeFields(n) }
                            }
                          }}
                          className={[
                            'w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors',
                            isSelected ? 'text-slate-200' : canSelect ? 'text-slate-400 hover:bg-slate-700 hover:text-slate-200' : 'text-slate-600 cursor-not-allowed'
                          ].join(' ')}
                        >
                          {isSelected ? (
                            <span className="w-4 h-4 rounded bg-indigo-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">{slotIdx + 1}</span>
                          ) : (
                            <span className="w-4 h-4 rounded border border-slate-600 flex-shrink-0" />
                          )}
                          <span className="text-xs">{field.label}</span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
              <div className="px-3 py-1.5 border-t border-slate-700 text-xs text-slate-500">
                {nodeFields.filter(Boolean).map((f, i) => (
                  <span key={i} className="mr-2">{i+1}: {ALL_FIELD_FLAT.find(o => o.value === f)?.label ?? f}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Persone non assegnate toggle */}
        <button
          onClick={() => setShowUnassigned(v => !v)}
          className={[
            'flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border transition-colors',
            showUnassigned
              ? 'bg-amber-900/20 border-amber-700 text-amber-300'
              : 'border-slate-600 text-slate-400 hover:text-slate-200',
          ].join(' ')}
        >
          <span className={[
            'inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold',
            personeNonAssegnate.length > 0 ? 'bg-amber-500 text-slate-900' : 'bg-slate-600 text-slate-400'
          ].join(' ')}>
            {personeNonAssegnate.length}
          </span>
          Non in posizione
        </button>

        {/* Persone già assegnate (riassegnazione) toggle */}
        <button
          onClick={() => setShowAssigned(v => !v)}
          className={[
            'flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border transition-colors',
            showAssigned
              ? 'bg-indigo-900/20 border-indigo-600 text-indigo-300'
              : 'border-slate-600 text-slate-400 hover:text-slate-200',
          ].join(' ')}
        >
          <span className={[
            'inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold',
            personeAssegnate.length > 0 ? 'bg-indigo-500 text-white' : 'bg-slate-600 text-slate-400'
          ].join(' ')}>
            {personeAssegnate.length}
          </span>
          In posizione
        </button>

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

      <div className="flex flex-1 min-h-0 relative">
        {/* Pannello sinistro: viste fissate + persone non in posizione */}
        {(pins.length > 0 || showUnassigned || showAssigned) && (
          <div 
            className="flex-shrink-0 border-r border-slate-700 bg-slate-900/60 flex flex-col overflow-hidden relative"
            style={{ width: leftPanelWidth }}
          >
            {/* Resize handle */}
            <div
              className={`absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-indigo-500/50 transition-colors ${isResizingLeftPanel ? 'bg-indigo-500' : ''}`}
              onMouseDown={() => setIsResizingLeftPanel(true)}
            />

            {/* Sezione: Viste fissate */}
            {pins.length > 0 && (
              <>
                <button
                  onClick={() => setPinsExpanded(v => !v)}
                  className="px-3 py-2 border-b border-slate-700 flex-shrink-0 w-full text-left hover:bg-slate-800/50 transition-colors"
                >
                  <span className="text-xs font-medium text-yellow-400 flex items-center gap-1.5">
                    <Pin className="w-3 h-3" />
                    Viste fissate ({pins.length})
                    <span className="ml-auto text-slate-500">{pinsExpanded ? '▲' : '▼'}</span>
                  </span>
                </button>
                {pinsExpanded && (
                  <div className="flex-shrink-0 border-b border-slate-700">
                    {[...pins].sort((a, b) => a.pinnedAt - b.pinnedAt).map(pin => (
                      <div key={pin.id}
                        className="flex items-center gap-1 px-2 py-1.5 hover:bg-slate-800 group cursor-pointer"
                        onClick={() => {
                          if (pinClickTimer.current) {
                            clearTimeout(pinClickTimer.current)
                            pinClickTimer.current = null
                            handleFocusExpand(pin.id)
                          } else {
                            pinClickTimer.current = setTimeout(() => {
                              pinClickTimer.current = null
                              handleDrillIn(pin.id)
                            }, 250)
                          }
                        }}
                        title="Clic: naviga · Doppio clic: espandi sottoalbero"
                      >
                        <span className="flex-1 text-xs text-slate-200 truncate">{pin.label}</span>
                        <button
                          onClick={e => { e.stopPropagation(); removePin(pin.id) }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-slate-700"
                        >
                          <PinOff className="w-3 h-3 text-slate-500 hover:text-yellow-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Sezione: Non in posizione */}
            {showUnassigned && (
              <>
                <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                  <span className="text-xs font-medium text-amber-400">
                    Non in posizione ({personeNonAssegnate.length})
                  </span>
                </div>
                <div className="px-2 py-1.5 border-b border-slate-800 flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Cerca..."
                    value={unassignedSearch}
                    onChange={e => setUnassignedSearch(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {personeNonAssegnateFiltrate.length === 0 ? (
                    <p className="text-xs text-slate-600 italic text-center py-4">Nessuna</p>
                  ) : personeNonAssegnateFiltrate.map(p => (
                    <div
                      key={p.cf}
                      draggable
                      onDragStart={e => { e.dataTransfer.setData('person-cf', p.cf); e.dataTransfer.effectAllowed = 'copy' }}
                      className="px-2 py-1.5 rounded bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 cursor-grab active:cursor-grabbing"
                      title="Trascina su un nodo per assegnare"
                    >
                      <div className="text-xs font-medium text-slate-200 truncate">
                        {p.cognome} {p.nome}
                      </div>
                      <div className="text-xs text-slate-500 font-mono truncate">{p.cf}</div>
                      {p.area && <div className="text-xs text-slate-600 truncate">{p.area}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Sezione: In posizione (riassegnazione) */}
            {showAssigned && (
              <>
                <div className="px-3 py-2 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
                  <span className="text-xs font-medium text-indigo-400">
                    In posizione ({personeAssegnate.length})
                  </span>
                </div>
                <div className="px-2 py-1 border-b border-slate-800 flex-shrink-0">
                  <p className="text-xs text-slate-500 leading-tight">
                    Trascina su un nodo per spostare o associare a più posizioni.
                  </p>
                </div>
                <div className="px-2 py-1.5 border-b border-slate-800 flex-shrink-0">
                  <input
                    type="text"
                    placeholder="Cerca..."
                    value={assignedSearch}
                    onChange={e => setAssignedSearch(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {personeAssegnateFiltrate.length === 0 ? (
                    <p className="text-xs text-slate-600 italic text-center py-4">Nessuna</p>
                  ) : personeAssegnateFiltrate.map(p => {
                    const nodiDellaPersona = filtered.filter(n => n.cf_persona === p.cf)
                    return (
                      <div
                        key={p.cf}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData('person-cf', p.cf); e.dataTransfer.effectAllowed = 'copy' }}
                        className="px-2 py-1.5 rounded bg-indigo-950/40 hover:bg-indigo-900/30 border border-indigo-800/30 cursor-grab active:cursor-grabbing"
                        title="Trascina su un nodo per spostare o aggiungere"
                      >
                        <div className="text-xs font-medium text-slate-200 truncate">
                          {p.cognome} {p.nome}
                        </div>
                        <div className="text-xs text-slate-500 font-mono truncate">{p.cf}</div>
                        {nodiDellaPersona.length > 0 && (
                          <div className="text-xs text-indigo-400/70 truncate">
                            {nodiDellaPersona.map(n => n.nome_uo ?? n.id).join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0 relative">
          {visualMode === 'treemap' ? (
            <TreemapView
              data={drilledNodi}
              rootId={drillRootId || undefined}
              selectedNodeId={focusedNode ?? undefined}
              onNodeClick={(id) => setFocusedNode(id)}
              onNodeContextMenu={(e, nodeId) => {
                setFocusedNode(nodeId)
                setContextMenu({ nodeId, x: e.clientX, y: e.clientY })
              }}
            />
          ) : (
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
          )}
        </div>

        {drawerOpen && (
          <div className="w-[420px] flex-shrink-0 border-l border-slate-700 bg-slate-900 overflow-y-auto">
            <RecordDrawer
              variant="panel" open={drawerOpen}
              type="nodo" record={drawerRecord}
              initialMode={drawerInitialMode}
              onClose={() => { setDrawerOpen(false); setFocusedNode(null) }}
              onSaved={refreshAll}
            />
          </div>
        )}

        {/* ── Vista Stampa overlay ─────────────────────────────────────────── */}
        {printMode && (
          <div className="absolute inset-0 z-20 flex" style={{ background: '#f3f4f6' }}>
            {/* Pannello sinistra — lista pin */}
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
              <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                <span className="font-medium text-sm text-gray-700">Pagine (viste fissate)</span>
                <button
                  onClick={() => setPrintMode(false)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {pins.length === 0 ? (
                  <p className="text-xs text-gray-400 p-2">
                    Nessuna vista fissata. Fissa dei nodi dalla vista organigramma (tasto destro → Fissa).
                  </p>
                ) : (
                  [...pins].sort((a, b) => a.pinnedAt - b.pinnedAt).map(pin => (
                    <div
                      key={pin.id}
                      onClick={() => setActivePrintPin(pin.id)}
                      className={[
                        'p-2 rounded cursor-pointer border transition-colors',
                        activePrintPin === pin.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      ].join(' ')}
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">{pin.label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <label className="text-xs text-gray-500">Livelli:</label>
                        <input
                          type="number" min={1} max={8}
                          value={pin.maxDepth ?? 3}
                          onClick={e => e.stopPropagation()}
                          onChange={e => updatePin(pin.id, { maxDepth: Math.max(1, Math.min(8, +e.target.value)) })}
                          className="w-12 text-xs border border-gray-300 rounded px-1 py-0.5 text-gray-700"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-3 border-t border-gray-200">
                <button
                  onClick={handleExportPdf}
                  disabled={pdfExporting || pins.length === 0}
                  className="w-full bg-indigo-600 text-white text-sm py-1.5 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {pdfExporting ? 'Generazione PDF...' : `Esporta PDF (${pins.length} pagine)`}
                </button>
              </div>
            </div>

            {/* Area destra — preview */}
            <div className="flex-1 overflow-auto p-8">
              {activePrintPin ? (() => {
                const pin = pins.find(p => p.id === activePrintPin)
                if (!pin) return null
                return (
                  <div
                    id="print-page-preview"
                    style={{ background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,.15)', display: 'inline-block', minWidth: 400 }}
                  >
                    <PrintOrgChart
                      allNodes={filtered}
                      personeMap={personaMap}
                      rootId={activePrintPin}
                      maxDepth={pin.maxDepth ?? 3}
                      nodePositions={pin.nodePositions ?? {}}
                      onNodeMove={(id, x, y) => {
                        updatePin(activePrintPin, {
                          nodePositions: { ...(pin.nodePositions ?? {}), [id]: { x, y } }
                        })
                      }}
                      interactive
                    />
                  </div>
                )
              })() : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Seleziona una pagina dal pannello
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x} y={contextMenu.y}
          label={filtered.find(n => n.id === contextMenu.nodeId)?.nome_uo ?? contextMenu.nodeId}
          hasChildren={(childCountMap.get(contextMenu.nodeId) ?? 0) > 0}
          isPinned={isPinned(contextMenu.nodeId)}
          onPin={() => {
            const nodo = filtered.find(n => n.id === contextMenu.nodeId)
            addPin({ id: contextMenu.nodeId, label: nodo?.nome_uo ?? contextMenu.nodeId, mode: 'navigate', pinnedAt: Date.now() })
          }}
          onUnpin={() => removePin(contextMenu.nodeId)}
          onFocusExpand={() => handleFocusExpand(contextMenu.nodeId)}
          onDrillIn={() => handleDrillIn(contextMenu.nodeId)}
          onOpenDetail={() => { const n = filtered.find(n => n.id === contextMenu.nodeId); if (n) openDrawer(n) }}
          onCreateChild={() => handleCreateChildNode(contextMenu.nodeId)}
          onRemove={() => {
            const label = filtered.find(n => n.id === contextMenu.nodeId)?.nome_uo ?? contextMenu.nodeId
            setPendingRemove({ nodeId: contextMenu.nodeId, label })
          }}
          onHardDelete={() => {
            const label = filtered.find(n => n.id === contextMenu.nodeId)?.nome_uo ?? contextMenu.nodeId
            setPendingHardDelete({ nodeId: contextMenu.nodeId, label })
          }}
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

      {/* Assign person confirmation modal */}
      {pendingAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-200">Assegna persona</h3>
            <p className="text-sm text-slate-400">
              Assegna <span className="text-indigo-300 font-medium">{pendingAssign.personName}</span> al nodo{' '}
              <span className="text-slate-100 font-medium">{pendingAssign.nodeLabel}</span>?
            </p>
            {pendingAssign.existingCf && (
              <p className="text-xs text-amber-400">
                Attenzione: sostituisce <span className="font-medium">{pendingAssign.existingName ?? pendingAssign.existingCf}</span> attualmente assegnato.
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setPendingAssign(null)}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmAssign}
                className="px-4 py-1.5 text-sm bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg transition-colors"
              >
                Assegna
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multi-assign modal: sposta o associa a più nodi */}
      {pendingMultiAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[460px] p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-200">Persona già in posizione</h3>
            <p className="text-sm text-slate-400">
              <span className="text-indigo-300 font-medium">{pendingMultiAssign.personName}</span> è già
              assegnata a {pendingMultiAssign.sourceNodeIds.length === 1 ? 'un nodo' : `${pendingMultiAssign.sourceNodeIds.length} nodi`}.
              Come vuoi procedere per il nodo <span className="text-slate-100 font-medium">{pendingMultiAssign.targetNodeLabel}</span>?
            </p>
            {pendingMultiAssign.targetExistingCf && (
              <p className="text-xs text-amber-400">
                Il nodo target ha già <span className="font-medium">{pendingMultiAssign.targetExistingName ?? pendingMultiAssign.targetExistingCf}</span> — verrà sostituita.
              </p>
            )}
            <div className="flex flex-col gap-2 mt-1">
              <button
                onClick={() => handleConfirmMultiAssign('add')}
                disabled={multiAssignLoading}
                className="w-full text-left px-4 py-3 bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-700/50 rounded-lg transition-colors disabled:opacity-50"
              >
                <div className="text-sm font-medium text-indigo-300">Associa a più nodi</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  La persona rimane sui nodi attuali e viene aggiunta anche a <span className="text-slate-200">{pendingMultiAssign.targetNodeLabel}</span>.
                </div>
              </button>
              <button
                onClick={() => handleConfirmMultiAssign('move')}
                disabled={multiAssignLoading}
                className="w-full text-left px-4 py-3 bg-slate-800/60 hover:bg-slate-800 border border-slate-600/50 rounded-lg transition-colors disabled:opacity-50"
              >
                <div className="text-sm font-medium text-slate-200">Sposta</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  La persona viene rimossa dai nodi attuali e assegnata solo a <span className="text-slate-200">{pendingMultiAssign.targetNodeLabel}</span>.
                </div>
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button onClick={() => setPendingMultiAssign(null)} disabled={multiAssignLoading}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove node confirmation modal */}
      {pendingRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-amber-300">Rimuovi nodo</h3>
            <p className="text-sm text-slate-400">
              Rimuovi <span className="text-slate-100 font-medium">{pendingRemove.label}</span>?
            </p>
            <p className="text-xs text-slate-500">
              Il nodo verrà disattivato (<code className="font-mono bg-slate-800 px-1 rounded">deleted_at</code>) ma resterà nello storico e potrà essere ripristinato.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingRemove(null)} disabled={nodeActionLoading}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Annulla
              </button>
              <button onClick={handleConfirmRemove} disabled={nodeActionLoading}
                className="px-4 py-1.5 text-sm bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50">
                {nodeActionLoading ? 'Rimozione…' : 'Rimuovi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hard delete node confirmation modal */}
      {pendingHardDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-red-800 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-red-400">Elimina nodo definitivamente</h3>
            <p className="text-sm text-slate-400">
              Elimina <span className="text-slate-100 font-medium">{pendingHardDelete.label}</span>?
            </p>
            <p className="text-xs text-red-400">
              Attenzione: il nodo verrà cancellato fisicamente dal database e non potrà essere recuperato.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setPendingHardDelete(null)} disabled={nodeActionLoading}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Annulla
              </button>
              <button onClick={handleConfirmHardDelete} disabled={nodeActionLoading}
                className="px-4 py-1.5 text-sm bg-red-700 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50">
                {nodeActionLoading ? 'Eliminazione…' : 'Elimina definitivamente'}
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
      {/* Modale Alert Leggibilità */}
      <InfoDialog
        open={showReadabilityAlert}
        title="Vista Complessa"
        confirmLabel="Ho capito"
        onClose={() => {
          setShowReadabilityAlert(false)
          dismissReadabilityAlert()
        }}
        message={
          <div className="space-y-3">
            <p>
              Attualmente ci sono molti nodi aperti contemporaneamente ed è difficile visualizzarli tutti agevolmente in questo formato.
            </p>
            <p>
              Per una visione complessiva aggregata ti consigliamo di esplorare la nuova modalità <strong className="text-white">Treemap</strong> nella barra superiore, oppure di chiudere i nodi più estesi con &quot;Comprimi tutto&quot;.
            </p>
          </div>
        }
      />
    </div>
  )
}
