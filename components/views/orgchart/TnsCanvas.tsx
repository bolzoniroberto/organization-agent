'use client'
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge,
  BackgroundVariant, useReactFlow, useViewport,
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
import { EDGE_TYPES } from '@/components/orgchart/OrgEdge'
import { usePersistedState } from '@/lib/use-persisted-state'

const NODE_TYPES = { orgNode: OrgNode, orgGroup: OrgGroupNode }
const TARGET_RATIO = 1.8
const MAX_ITER = 5

const ALL_FIELD_OPTIONS: { group: string; fields: { value: string; label: string }[] }[] = [
  { group: 'Struttura', fields: [
    { value: '', label: '— nessuno —' },
    { value: 'nome', label: 'Nome struttura' },
    { value: 'codice', label: 'Codice' },
    { value: 'livello', label: 'Livello' },
    { value: 'tipo', label: 'Tipo' },
    { value: 'sede_tns', label: 'Sede TNS' },
    { value: 'titolare', label: 'Titolare (testo)' },
    { value: 'cf_titolare', label: 'CF Titolare' },
    { value: 'cdc', label: 'CdC' },
    { value: 'descrizione', label: 'Descrizione' },
  ]},
  { group: 'Persona titolare', fields: [
    { value: 'p:nome_completo', label: 'Nome Cognome' },
    { value: 'p:cognome', label: 'Cognome' },
    { value: 'p:nome', label: 'Nome' },
    { value: 'p:qualifica', label: 'Qualifica' },
    { value: 'p:area', label: 'Area' },
    { value: 'p:societa', label: 'Società' },
    { value: 'p:email', label: 'Email' },
    { value: 'p:matricola', label: 'Matricola' },
  ]},
]
const ALL_FIELD_FLAT = ALL_FIELD_OPTIONS.flatMap(g => g.fields)

function resolveField(s: StrutturaTns, field: string, personaMap?: Map<string, Persona>): string | null | undefined {
  if (!field) return null
  if (field.startsWith('p:') && personaMap && s.cf_titolare) {
    const p = personaMap.get(s.cf_titolare)
    if (!p) return null
    const key = field.slice(2)
    if (key === 'nome_completo') return `${p.cognome ?? ''} ${p.nome ?? ''}`.trim() || null
    return (p as unknown as Record<string, unknown>)[key] as string | null
  }
  return (s as unknown as Record<string, unknown>)[field] as string | null
}

export default function TnsCanvas() {
  const { struttureTns, persone, refreshAll, showToast } = useHRStore()
  const filtered = useMemo(() => struttureTns.filter(s => s.attivo !== 0 && !s.deleted_at), [struttureTns])
  const tns = useMemo(() => persone.filter((p): p is Persona & { codice_tns: string } => p.codice_tns != null), [persone])
  const personaMap = useMemo(() => new Map(persone.filter(p => !p.deleted_at).map(p => [p.cf, p])), [persone])

  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerRecord, setDrawerRecord] = useState<StrutturaTns | null>(null)
  const [drawerMode, setDrawerMode] = useState<'view' | 'edit'>('view')
  const [drawerForm, setDrawerForm] = useState<Record<string, string>>({})
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<StrutturaTns[]>([])
  const [highlightedNode, setHighlightedNode] = useState<string | null>(null)
  const [nodeFields, setNodeFields] = usePersistedState<[string, string, string]>('orgchart:tns:nodeFields', ['nome', 'codice', 'livello'])
  const [focusedNode, setFocusedNode] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [groupByName, setGroupByName] = useState(false)
  const [leafListMode, setLeafListMode] = useState(false)
  const [showFieldsPanel, setShowFieldsPanel] = useState(false)
  const [showSenzaPadre, setShowSenzaPadre] = useState(false)
  const [senzaPadreSearch, setSenzaPadreSearch] = useState('')
  const [leftPanelWidth, setLeftPanelWidth] = useState(240)
  const [isResizingLeftPanel, setIsResizingLeftPanel] = useState(false)
  // Crea struttura TNS
  const [createModal, setCreateModal] = useState<{ padre: string | null } | null>(null)
  const [createCodice, setCreateCodice] = useState('')
  const [createNome, setCreateNome] = useState('')
  const [createLoading, setCreateLoading] = useState(false)
  // Drop persona senza padre su un nodo TNS
  const [pendingDropPerson, setPendingDropPerson] = useState<{
    cf: string; personName: string; personCodice: string | null
    targetCodice: string; targetLabel: string
    strutturEsiste: boolean
  } | null>(null)
  const [dropNewCodice, setDropNewCodice] = useState('')
  const [dropNewNome, setDropNewNome] = useState('')
  const [dropLoading, setDropLoading] = useState(false)
  const prevVisibleIdsRef = useRef<Set<string>>(new Set())
  const compactModeRef = useRef(false)

  useEffect(() => {
    if (!isResizingLeftPanel) return
    const onMove = (e: MouseEvent) => setLeftPanelWidth(Math.max(200, Math.min(e.clientX, 600)))
    const onUp = () => setIsResizingLeftPanel(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [isResizingLeftPanel])

  const personeSenzaPadreTns = useMemo(() => {
    return persone
      .filter(p => !p.deleted_at && p.codice_tns != null && p.padre_tns == null)
      .sort((a, b) => (a.cognome ?? '').localeCompare(b.cognome ?? ''))
  }, [persone])

  const personeSenzaPadreFiltrate = useMemo(() => {
    if (!senzaPadreSearch) return personeSenzaPadreTns
    const lower = senzaPadreSearch.toLowerCase()
    return personeSenzaPadreTns.filter(p =>
      p.cf.toLowerCase().includes(lower) ||
      (p.cognome?.toLowerCase().includes(lower) ?? false) ||
      (p.nome?.toLowerCase().includes(lower) ?? false)
    )
  }, [personeSenzaPadreTns, senzaPadreSearch])

  const { fitView, setCenter } = useReactFlow()
  const { zoom } = useViewport()
  const { drillRootId, drillMode, drillInto, drillTo } = useOrgDrill()

  const drillBreadcrumb = useMemo(() => {
    const items: { id: string | null; label: string }[] = [{ id: null, label: 'Radice' }]
    if (!drillRootId) return items
    const ancestors: { id: string; label: string }[] = []
    let cur: string | null = drillRootId
    while (cur) {
      const s = filtered.find(s => s.codice === cur)
      if (!s) break
      ancestors.unshift({ id: cur, label: s.nome ?? cur })
      cur = s.padre ?? null
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

  // ── Raggruppamento strutture con stesso nome (solo foglie) ──────────────────
  const [groupedResult, groupedMap] = useMemo((): [StrutturaTns[], Map<string, StrutturaTns[]>] => {
    if (!groupByName) return [drilledFiltered, new Map()]
    const hasChildrenInFull = new Set(filtered.map(s => s.padre).filter(Boolean) as string[])
    const grouped = new Map<string, StrutturaTns[]>()
    const branches: StrutturaTns[] = []
    drilledFiltered.forEach(s => {
      if (hasChildrenInFull.has(s.codice)) {
        branches.push(s)
      } else {
        const key = `${s.padre ?? '__ROOT__'}|||${s.nome ?? s.codice}`
        if (!grouped.has(key)) grouped.set(key, [])
        grouped.get(key)!.push(s)
      }
    })
    const result: StrutturaTns[] = [...branches]
    const gpMap = new Map<string, StrutturaTns[]>()
    grouped.forEach(group => {
      if (group.length === 1) {
        result.push(group[0])
      } else {
        const first = group[0]
        const safeName = (first.nome ?? first.codice).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)
        const virtualId = `grp_${first.padre ?? 'root'}_${safeName}`
        result.push({ ...first, codice: virtualId })
        gpMap.set(virtualId, group)
      }
    })
    return [result, gpMap]
  }, [drilledFiltered, groupByName, filtered])

  const visibleTree = useMemo(() => {
    function filterTree(nodes: TreeNode<StrutturaTns>[]): TreeNode<StrutturaTns>[] {
      return nodes.map(n => {
        if (collapsedSet.has(n.id)) return { ...n, children: [] }
        return { ...n, children: filterTree(n.children) }
      })
    }

    const root = buildTree(groupedResult, s => s.codice, s => s.padre ?? null)
    const metrics = analyzeTree(root)

    let vGap = 130
    if (leafListMode || groupByName) {
      const childrenOfId = new Map<string, string[]>()
      groupedResult.forEach(s => {
        if (s.padre) {
          if (!childrenOfId.has(s.padre)) childrenOfId.set(s.padre, [])
          childrenOfId.get(s.padre)!.push(s.codice)
        }
      })
      let maxNodeHeight = 80
      if (leafListMode) {
        childrenOfId.forEach(children => {
          if (children.every(c => !childrenOfId.has(c))) {
            const listH = Math.min(children.length * 22 + 20, 212)
            maxNodeHeight = Math.max(maxNodeHeight, 80 + listH)
          }
        })
      }
      if (groupByName) {
        groupedMap.forEach(g => {
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
  }, [groupedResult, collapsedSet, leafListMode, groupByName, groupedMap])

  const compactMode = useMemo(() => {
    const n = visibleTree.length
    if (!compactModeRef.current && n > 50 && zoom < 0.4) compactModeRef.current = true
    else if (compactModeRef.current && (zoom > 0.4 || n < 35)) compactModeRef.current = false
    return compactModeRef.current
  }, [visibleTree.length, zoom])

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

  const drillAncestorSet = useMemo((): Set<string> => {
    if (!drillRootId) return new Set()
    const s = new Set<string>()
    let cur = filtered.find(n => n.codice === drillRootId)?.padre ?? null
    while (cur) { s.add(cur); cur = filtered.find(n => n.codice === cur)?.padre ?? null }
    return s
  }, [drillRootId, filtered])

  const strutturaTnsMap = useMemo(() => {
    const m = new Map<string, StrutturaTns>()
    filtered.forEach(s => m.set(s.codice, s))
    return m
  }, [filtered])

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
    setDrawerRecord(s)
    setDrawerMode('view')
    setDrawerForm({})
    setDrawerOpen(true)
    setFocusedNode(codice)
  }, [filtered])

  const handleDropPersonOnTns = useCallback((targetCodice: string, cf: string) => {
    const persona = persone.find(p => p.cf === cf)
    if (!persona) return
    const personName = `${persona.cognome ?? ''} ${persona.nome ?? ''}`.trim() || cf
    const targetLabel = filtered.find(s => s.codice === targetCodice)?.nome ?? targetCodice
    const strutturEsiste = persona.codice_tns != null &&
      struttureTns.some(s => s.codice === persona.codice_tns && !s.deleted_at)
    setDropNewCodice(persona.codice_tns ?? '')
    setDropNewNome(personName)
    setPendingDropPerson({
      cf, personName, personCodice: persona.codice_tns,
      targetCodice, targetLabel, strutturEsiste
    })
  }, [persone, filtered, struttureTns])

  const handleConfirmDropAttach = useCallback(async () => {
    if (!pendingDropPerson?.personCodice) return
    setDropLoading(true)
    try {
      await api.struttureTns.update(pendingDropPerson.personCodice, { padre: pendingDropPerson.targetCodice })
      await api.persone.update(pendingDropPerson.cf, { padre_tns: pendingDropPerson.targetCodice })
      showToast(`${pendingDropPerson.personName} agganciato a ${pendingDropPerson.targetLabel}`, 'success')
      await refreshAll()
    } catch (e) { showToast(String(e), 'error') }
    finally { setDropLoading(false); setPendingDropPerson(null) }
  }, [pendingDropPerson, showToast, refreshAll])

  const handleConfirmDropCreate = useCallback(async () => {
    if (!pendingDropPerson || !dropNewCodice.trim()) return
    setDropLoading(true)
    try {
      const codice = dropNewCodice.trim()
      const personName = pendingDropPerson.personName
      await api.struttureTns.create({
        codice,
        nome: dropNewNome.trim() || personName,
        padre: pendingDropPerson.targetCodice,
        cf_titolare: pendingDropPerson.cf,
        titolare: personName,
        attivo: 1,
      })
      await api.persone.update(pendingDropPerson.cf, {
        padre_tns: pendingDropPerson.targetCodice,
        codice_tns: codice,
      })
      showToast(`Struttura "${codice}" creata sotto ${pendingDropPerson.targetLabel}`, 'success')
      await refreshAll()
    } catch (e) { showToast(String(e), 'error') }
    finally { setDropLoading(false); setPendingDropPerson(null) }
  }, [pendingDropPerson, dropNewCodice, dropNewNome, showToast, refreshAll])

  const handleConfirmCreate = useCallback(async () => {
    if (!createCodice.trim()) return
    setCreateLoading(true)
    try {
      await api.struttureTns.create({
        codice: createCodice.trim(),
        nome: createNome.trim() || null,
        padre: createModal?.padre ?? null,
        attivo: 1,
      })
      showToast(`Struttura "${createCodice.trim()}" creata`, 'success')
      await refreshAll()
      setCreateModal(null); setCreateCodice(''); setCreateNome('')
    } catch (e) { showToast(String(e), 'error') }
    finally { setCreateLoading(false) }
  }, [createCodice, createNome, createModal, showToast, refreshAll])

  const collapseToRoot = useCallback(() => {
    const allCodici = new Set(filtered.map(s => s.codice))
    const rootIds = new Set(filtered.filter(s => !s.padre || !allCodici.has(s.padre)).map(s => s.codice))
    drillTo(null, () => {
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

  const { nodes, edges } = useMemo(() => {
    const prevIds = prevVisibleIdsRef.current
    const newParentCount = new Map<string, number>()

    // ── leafListMode: map parent → absorbed leaf children ────────────────────
    const childrenOf = new Map<string, Array<TreeNode<StrutturaTns>>>()
    visibleTree.forEach(tn => {
      if (tn.item.padre) {
        const arr = childrenOf.get(tn.item.padre) ?? []
        arr.push(tn)
        childrenOf.set(tn.item.padre, arr)
      }
    })
    const leafListMap = new Map<string, Array<TreeNode<StrutturaTns>>>()
    if (leafListMode) {
      visibleTree.forEach(tn => {
        const children = childrenOf.get(tn.id) ?? []
        if (
          children.length > 0 &&
          children.every(c => (childrenOf.get(c.id)?.length ?? 0) === 0) &&
          children.every(c => !groupedMap.has(c.id))
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
        const codice = tn.id
        const s = strutturaTnsMap.get(codice)
        const totalChildren = childCountMap.get(codice) ?? 0
        const isCollapsed = collapsedSet.has(codice)

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

        const leafListChildren = leafListMap.get(codice)
        const leafList = leafListChildren?.map(child => ({
          id: child.id,
          label: resolveField(child.item, nodeFields[0], personaMap) ?? child.id,
          sublabel: resolveField(child.item, nodeFields[1], personaMap) ?? undefined,
          tipo: 'TNS' as const,
          onOpenDrawer: () => openDrawer(child.id)
        }))

        const gpList = groupedMap.get(codice)
        const groupedPersons = gpList?.map(gs => ({
          id: gs.codice,
          label: gs.titolare ?? gs.nome ?? gs.codice,
          sublabel: resolveField(gs, nodeFields[1], personaMap) ?? undefined,
          onOpenDrawer: () => openDrawer(gs.codice)
        }))

        const hasChildrenFlag = leafList ? false : totalChildren > 0
        const childrenCountVal = leafList ? leafListChildren!.length : totalChildren

        const label = gpList
          ? (resolveField(strutturaTnsMap.get(codice) ?? gpList[0], nodeFields[0], personaMap) ?? codice)
          : (s ? (resolveField(s, nodeFields[0], personaMap) ?? codice) : codice)
        const sublabel = gpList
          ? `${gpList.length} strutture`
          : (s && nodeFields[1] ? resolveField(s, nodeFields[1], personaMap) : undefined)
        const extraDetail = s && nodeFields[2] ? resolveField(s, nodeFields[2], personaMap) : undefined

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
            collapsed: leafList ? false : isCollapsed,
            hasChildren: hasChildrenFlag,
            childrenCount: childrenCountVal,
            depth: tn.depth,
            isOverflowed: false, hiddenCount: 0, colorScheme: undefined,
            semanticStatus: semanticStatusMap.get(codice),
            entranceDelay, compact: compactMode,
            isAncestor: drillAncestorSet.has(codice),
            onExpand: () => toggleCollapse(codice),
            onExpandOverflow: () => {},
            onOpenDrawer: gpList ? () => {} : () => openDrawer(codice),
            onDropPerson: (cf: string) => handleDropPersonOnTns(codice, cf),
            leafList,
            groupedPersons,
          },
          className: highlightedNode === codice ? 'ring-2 ring-indigo-400 rounded-lg' : undefined,
          style: focusStyle
        }
      })

    const treeEdges: Edge[] = visibleTree
      .filter(tn => tn.item.padre && !absorbedIds.has(tn.id))
      .map(tn => ({
        id: `${tn.item.padre}-${tn.id}`,
        source: tn.item.padre!,
        target: tn.id,
        type: 'orgEdge',
        style: { stroke: '#475569', strokeWidth: 1.5 }
      }))

    // ── Collapse ancestors into single breadcrumb chip ──────────────────────
    if (drillAncestorSet.size >= 2) {
      const drillRootTN = visibleTree.find(n => n.id === drillRootId)
      if (drillRootTN) {
        const chain: string[] = []
        let c: string | null = drillRootTN.item.padre ?? null
        while (c) { chain.unshift(c); c = filtered.find(n => n.codice === c)?.padre ?? null }
        const breadcrumbLabel = chain.map(id => {
          const s = filtered.find(n => n.codice === id)
          return s ? (resolveField(s, nodeFields[0], personaMap) ?? id) : id
        }).join(' › ')
        const lastAncestor = chain[chain.length - 1]
        const crumbNode: Node = {
          id: '__ancestors__',
          type: 'orgNode',
          position: { x: drillRootTN.x, y: drillRootTN.y - 80 },
          data: {
            id: '__ancestors__',
            label: breadcrumbLabel,
            tipo: 'TNS' as const,
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
  }, [visibleTree, collapsedSet, childCountMap, highlightedNode,
      toggleCollapse, semanticStatusMap, activePath, compactMode, openDrawer,
      strutturaTnsMap, nodeFields, leafListMode, groupedMap, groupByName,
      drillAncestorSet, drillRootId, filtered, personaMap])

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
  }, [filtered, drillRootId])

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
    drillInto(nodeId, 'expand', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
    })
  }, [drillInto, fitView])

  const handleDrillIn = useCallback((nodeId: string) => {
    drillInto(nodeId, 'navigate', () => {
      setCollapsedSet(new Set())
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 50)
    })
  }, [drillInto, fitView])

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
        {/* 1. Search */}
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

        {/* 2. Espandi/Comprimi (when not in drill) */}
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

        {/* 3. Raggruppa nomi */}
        <button onClick={() => setGroupByName(g => !g)} className={[
          'px-2.5 py-1.5 text-xs rounded-md border transition-colors',
          groupByName ? 'bg-violet-900/50 border-violet-600 text-violet-300 font-medium'
                      : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
        ].join(' ')} title="Raggruppa strutture foglia con lo stesso nome in una singola card">
          ⊞ Raggruppa nomi
        </button>

        {/* 4. Lista foglie */}
        <button onClick={() => setLeafListMode(m => !m)} className={[
          'px-2.5 py-1.5 text-xs rounded-md border transition-colors',
          leafListMode ? 'bg-teal-900/50 border-teal-600 text-teal-300 font-medium'
                       : 'border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
        ].join(' ')} title="Mostra le foglie come lista inline nel nodo padre">
          ≡ Lista foglie
        </button>

        {/* 5. Drill breadcrumb */}
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

        {/* 6. Drag edit mode */}
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

        {/* 7. Nuova struttura */}
        <button
          onClick={() => { setCreateCodice(''); setCreateNome(''); setCreateModal({ padre: null }) }}
          className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border border-green-700 text-green-400 hover:bg-green-900/20 transition-colors"
        >
          + Nuova struttura
        </button>

        {/* 8. Senza padre TNS toggle */}
        <button
          onClick={() => setShowSenzaPadre(v => !v)}
          className={[
            'flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border transition-colors',
            showSenzaPadre
              ? 'bg-rose-900/20 border-rose-700 text-rose-300'
              : 'border-slate-600 text-slate-400 hover:text-slate-200',
          ].join(' ')}
        >
          <span className={[
            'inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-bold',
            personeSenzaPadreTns.length > 0 ? 'bg-rose-500 text-white' : 'bg-slate-600 text-slate-400'
          ].join(' ')}>
            {personeSenzaPadreTns.length}
          </span>
          Senza padre TNS
        </button>

        {/* 8. Spacer */}
        <div className="flex-1" />

        {/* 8. Focus indicator */}
        {focusedNode && !drillRootId && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-900/30 border border-indigo-700 rounded-md text-xs text-indigo-300">
            <span className="truncate max-w-[150px]">{focusedLabel}</span>
            <button onClick={clearFocus}><X className="w-3 h-3" /></button>
          </div>
        )}

        {/* 9. Campi panel */}
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
                <button onClick={() => setNodeFields(['nome', 'codice', 'livello'])} className="text-xs text-slate-500 hover:text-slate-300">reset</button>
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
                  <span key={i} className="mr-2">{i + 1}: {ALL_FIELD_FLAT.find(o => o.value === f)?.label ?? f}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Pannello sinistro: persone senza padre TNS */}
        {showSenzaPadre && (
          <div
            className="flex-shrink-0 border-r border-slate-700 bg-slate-900/60 flex flex-col overflow-hidden relative"
            style={{ width: leftPanelWidth }}
          >
            <div
              className={`absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize z-10 hover:bg-rose-500/50 transition-colors ${isResizingLeftPanel ? 'bg-rose-500' : ''}`}
              onMouseDown={() => setIsResizingLeftPanel(true)}
            />
            <div className="px-3 py-2 border-b border-slate-700 flex-shrink-0">
              <span className="text-xs font-medium text-rose-400">
                Senza padre TNS ({personeSenzaPadreTns.length})
              </span>
            </div>
            <div className="px-2 py-1 border-b border-slate-800 flex-shrink-0">
              <p className="text-xs text-slate-500 leading-tight">
                Hanno <code className="font-mono bg-slate-800 px-0.5 rounded">codice_tns</code> ma nessun <code className="font-mono bg-slate-800 px-0.5 rounded">padre_tns</code>.
              </p>
            </div>
            <div className="px-2 py-1.5 border-b border-slate-800 flex-shrink-0">
              <input
                type="text"
                placeholder="Cerca..."
                value={senzaPadreSearch}
                onChange={e => setSenzaPadreSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {personeSenzaPadreFiltrate.length === 0 ? (
                <p className="text-xs text-slate-600 italic text-center py-4">Nessuna</p>
              ) : personeSenzaPadreFiltrate.map(p => (
                <div
                  key={p.cf}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData('person-cf', p.cf); e.dataTransfer.effectAllowed = 'copy' }}
                  className="px-2 py-1.5 rounded bg-rose-950/30 border border-rose-900/30 cursor-grab active:cursor-grabbing"
                  title="Trascina su un nodo TNS per collegare"
                >
                  <div className="text-xs font-medium text-slate-200 truncate">
                    {p.cognome} {p.nome}
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">{p.cf}</div>
                  {p.codice_tns && (
                    <div className="text-xs text-rose-400/70 truncate">TNS: {p.codice_tns}</div>
                  )}
                  {p.qualifica && (
                    <div className="text-xs text-slate-600 truncate">{p.qualifica}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
          <div className="w-[440px] flex-shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-100 truncate">{drawerRecord.nome ?? drawerRecord.codice}</h2>
                <p className="text-xs text-slate-500">{drawerRecord.codice} · {drawerRecord.livello ?? '—'}</p>
              </div>
              <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                {drawerMode === 'view' ? (
                  <button
                    onClick={() => {
                      setDrawerMode('edit')
                      setDrawerForm(Object.fromEntries(
                        Object.entries(drawerRecord).map(([k, v]) => [k, v == null ? '' : String(v)])
                      ))
                    }}
                    className="px-3 py-1 text-xs bg-indigo-700 hover:bg-indigo-600 text-white rounded-md transition-colors"
                  >
                    Modifica
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setDrawerMode('view'); setDrawerForm({}) }}
                      disabled={drawerSaving}
                      className="px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={async () => {
                        setDrawerSaving(true)
                        try {
                          const patch: Record<string, string | null> = {}
                          for (const [k, v] of Object.entries(drawerForm)) {
                            const orig = (drawerRecord as unknown as Record<string, unknown>)[k]
                            const origStr = orig == null ? '' : String(orig)
                            if (v !== origStr) patch[k] = v === '' ? null : v
                          }
                          if (Object.keys(patch).length > 0) {
                            await api.struttureTns.update(drawerRecord.codice, patch)
                            await refreshAll()
                            const updated = struttureTns.find(s => s.codice === drawerRecord.codice)
                            if (updated) setDrawerRecord(updated)
                            showToast('Salvato', 'success')
                          }
                          setDrawerMode('view')
                        } catch (e) { showToast(String(e), 'error') }
                        finally { setDrawerSaving(false) }
                      }}
                      disabled={drawerSaving}
                      className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded-md transition-colors disabled:opacity-50"
                    >
                      {drawerSaving ? 'Salvo…' : 'Salva'}
                    </button>
                  </>
                )}
                <button onClick={() => { setDrawerOpen(false); setFocusedNode(null) }}
                  className="p-1.5 hover:bg-slate-700 rounded-md text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {drawerMode === 'view' ? (
                <div className="p-4 space-y-0">
                  {[
                    ['Identificazione', [
                      ['Codice', drawerRecord.codice],
                      ['Nome', drawerRecord.nome],
                      ['Padre', drawerRecord.padre],
                      ['Livello', drawerRecord.livello],
                      ['Tipo', drawerRecord.tipo],
                      ['Attivo', drawerRecord.attivo === 1 ? 'Sì' : 'No'],
                      ['CdC', drawerRecord.cdc],
                      ['Sede TNS', drawerRecord.sede_tns],
                      ['Descrizione', drawerRecord.descrizione],
                    ]],
                    ['Persone', [
                      ['Titolare', drawerRecord.titolare],
                      ['CF Titolare', drawerRecord.cf_titolare],
                      ['Viaggiatore', drawerRecord.viaggiatore],
                      ['Approvatore', drawerRecord.approvatore],
                      ['Cassiere', drawerRecord.cassiere],
                      ['Visualizzatore', drawerRecord.visualizzatore],
                      ['Segretario', drawerRecord.segretario],
                      ['Controllore', drawerRecord.controllore],
                      ['Amministrazione', drawerRecord.amministrazione],
                      ['Controllore asst', drawerRecord.controllore_asst],
                      ['Segretario asst', drawerRecord.segretario_asst],
                      ['Segreteria red asst', drawerRecord.segreteria_red_asst],
                    ]],
                    ['Ruoli', [
                      ['Ruoli', drawerRecord.ruoli],
                      ['Ruoli OLTRV', drawerRecord.ruoli_oltrv],
                      ['Segr. redaz.', drawerRecord.segr_redaz],
                      ['Ruoli AFC', drawerRecord.ruoli_afc],
                      ['Ruoli HR', drawerRecord.ruoli_hr],
                      ['Altri ruoli', drawerRecord.altri_ruoli],
                      ['Gruppo sind.', drawerRecord.gruppo_sind],
                    ]],
                  ].map(([section, rows]) => {
                    const visible = (rows as [string, unknown][]).filter(([, v]) => v != null && v !== '')
                    if (!visible.length) return null
                    return (
                      <div key={section as string} className="mb-4">
                        <p className="text-xs uppercase tracking-wider text-slate-600 font-medium mb-1.5">{section as string}</p>
                        {visible.map(([k, v]) => (
                          <div key={k} className="flex gap-2 py-1 border-b border-slate-800 last:border-0">
                            <span className="w-36 text-xs text-slate-500 shrink-0 pt-0.5">{k}</span>
                            <span className="text-sm text-slate-200 break-all">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-4 space-y-5">
                  {[
                    { section: 'Identificazione', fields: [
                      { key: 'nome', label: 'Nome' },
                      { key: 'padre', label: 'Padre (codice)' },
                      { key: 'livello', label: 'Livello' },
                      { key: 'tipo', label: 'Tipo' },
                      { key: 'cdc', label: 'Centro di costo' },
                      { key: 'sede_tns', label: 'Sede TNS' },
                      { key: 'descrizione', label: 'Descrizione' },
                    ]},
                    { section: 'Persone', fields: [
                      { key: 'titolare', label: 'Titolare' },
                      { key: 'cf_titolare', label: 'CF Titolare' },
                      { key: 'viaggiatore', label: 'Viaggiatore' },
                      { key: 'approvatore', label: 'Approvatore' },
                      { key: 'cassiere', label: 'Cassiere' },
                      { key: 'visualizzatore', label: 'Visualizzatore' },
                      { key: 'segretario', label: 'Segretario' },
                      { key: 'controllore', label: 'Controllore' },
                      { key: 'amministrazione', label: 'Amministrazione' },
                      { key: 'controllore_asst', label: 'Controllore asst' },
                      { key: 'segretario_asst', label: 'Segretario asst' },
                      { key: 'segreteria_red_asst', label: 'Segreteria red asst' },
                    ]},
                    { section: 'Ruoli', fields: [
                      { key: 'ruoli', label: 'Ruoli' },
                      { key: 'ruoli_oltrv', label: 'Ruoli OLTRV' },
                      { key: 'segr_redaz', label: 'Segr. redaz.' },
                      { key: 'ruoli_afc', label: 'Ruoli AFC' },
                      { key: 'ruoli_hr', label: 'Ruoli HR' },
                      { key: 'altri_ruoli', label: 'Altri ruoli' },
                      { key: 'gruppo_sind', label: 'Gruppo sind.' },
                    ]},
                  ].map(({ section, fields }) => (
                    <div key={section}>
                      <p className="text-xs uppercase tracking-wider text-slate-600 font-medium mb-2">{section}</p>
                      <div className="space-y-2">
                        {fields.map(({ key, label }) => (
                          <div key={key}>
                            <label className="text-xs text-slate-500 block mb-0.5">{label}</label>
                            <input
                              value={drawerForm[key] ?? ''}
                              onChange={e => setDrawerForm(f => ({ ...f, [key]: e.target.value }))}
                              className="w-full px-2.5 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-md text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-600 font-medium mb-2">Stato</p>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={drawerForm['attivo'] === '1'}
                        onChange={e => setDrawerForm(f => ({ ...f, attivo: e.target.checked ? '1' : '0' }))}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-300">Attivo</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x} y={contextMenu.y}
          label={filtered.find(s => s.codice === contextMenu.nodeId)?.nome ?? contextMenu.nodeId}
          hasChildren={(childCountMap.get(contextMenu.nodeId) ?? 0) > 0}
          isPinned={false}
          onPin={() => {}}
          onUnpin={() => {}}
          onFocusExpand={() => handleFocusExpand(contextMenu.nodeId)}
          onDrillIn={() => handleDrillIn(contextMenu.nodeId)}
          onOpenDetail={() => { const s = filtered.find(s => s.codice === contextMenu.nodeId) ?? null; setDrawerRecord(s); setDrawerOpen(true) }}
          onCreateChild={() => { setCreateCodice(''); setCreateNome(''); setCreateModal({ padre: contextMenu.nodeId }) }}
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

      {/* Crea struttura TNS modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-96 p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-green-300">
              {createModal.padre
                ? `Nuova struttura figlia di "${filtered.find(s => s.codice === createModal.padre)?.nome ?? createModal.padre}"`
                : 'Nuova struttura TNS radice'}
            </h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Codice <span className="text-red-400">*</span></label>
                <input
                  autoFocus
                  value={createCodice}
                  onChange={e => setCreateCodice(e.target.value)}
                  placeholder="es. ABC-001"
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome</label>
                <input
                  value={createNome}
                  onChange={e => setCreateNome(e.target.value)}
                  placeholder="Nome descrittivo"
                  className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button
                onClick={() => { setCreateModal(null); setCreateCodice(''); setCreateNome('') }}
                disabled={createLoading}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmCreate}
                disabled={createLoading || !createCodice.trim()}
                className="px-4 py-1.5 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {createLoading ? 'Creazione…' : 'Crea struttura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drop persona senza padre TNS modal */}
      {pendingDropPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[480px] p-6 flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-slate-200">Collega persona alla gerarchia TNS</h3>
            <p className="text-sm text-slate-400">
              <span className="text-indigo-300 font-medium">{pendingDropPerson.personName}</span> verrà
              collegata sotto <span className="text-slate-100 font-medium">{pendingDropPerson.targetLabel}</span>.
            </p>
            <div className="flex flex-col gap-2">
              {pendingDropPerson.strutturEsiste && (
                <button
                  onClick={handleConfirmDropAttach}
                  disabled={dropLoading}
                  className="w-full text-left px-4 py-3 bg-indigo-900/30 hover:bg-indigo-900/50 border border-indigo-700/50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <div className="text-sm font-medium text-indigo-300">Aggancia struttura esistente</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    La struttura <span className="font-mono text-slate-300">{pendingDropPerson.personCodice}</span> diventa
                    figlia di <span className="text-slate-200">{pendingDropPerson.targetLabel}</span>.
                  </div>
                </button>
              )}
              <div className="w-full px-4 py-3 bg-slate-800/60 border border-slate-600/50 rounded-lg">
                <div className="text-sm font-medium text-slate-200 mb-2">Crea nuova struttura di approvazione</div>
                <div className="flex flex-col gap-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Codice <span className="text-red-400">*</span></label>
                    <input
                      value={dropNewCodice}
                      onChange={e => setDropNewCodice(e.target.value)}
                      placeholder="es. ABC-001"
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Nome struttura</label>
                    <input
                      value={dropNewNome}
                      onChange={e => setDropNewNome(e.target.value)}
                      placeholder="Nome descrittivo"
                      className="w-full bg-slate-700 border border-slate-600 rounded px-2.5 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    onClick={handleConfirmDropCreate}
                    disabled={dropLoading || !dropNewCodice.trim()}
                    className="self-end px-4 py-1.5 text-sm bg-indigo-700 hover:bg-indigo-600 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {dropLoading ? 'Creazione…' : 'Crea e collega'}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setPendingDropPerson(null)} disabled={dropLoading}
                className="px-4 py-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Annulla
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
