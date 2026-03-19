'use client'
import React, { useRef, useCallback } from 'react'
import type { NodoOrganigramma, Persona } from '@/types'
import { buildTree, layoutTree, flattenTree } from '@/lib/orgchart-layout'

export const A4_W = 1056
export const A4_H = 748
export const HEADER_H = 56
const NODE_W = 180
const NODE_H = 72
const H_GAP = 200   // NODE_W + 20px margine
const V_GAP = 120

interface FlatNode {
  id: string
  parentId: string | null
  x: number
  y: number
  item: NodoOrganigramma
  leafList?: NodoOrganigramma[]   // persone assorbite come lista
}

function buildSubtree(allNodes: NodoOrganigramma[], rootId: string, maxDepth: number): NodoOrganigramma[] {
  const result: NodoOrganigramma[] = []
  function collect(id: string, depth: number) {
    const node = allNodes.find(n => n.id === id)
    if (!node) return
    result.push(node)
    if (depth < maxDepth) allNodes.filter(n => n.reports_to === id).forEach(c => collect(c.id, depth + 1))
  }
  collect(rootId, 0)
  return result
}

/** Foglia "non classificata" = stesso nome_uo del padre oppure nome_uo nullo */
function isSameUoLeaf(leaf: NodoOrganigramma, parent: NodoOrganigramma): boolean {
  return !leaf.nome_uo || leaf.nome_uo === parent.nome_uo
}

export interface PrintOrgChartProps {
  allNodes: NodoOrganigramma[]
  personeMap: Map<string, Persona>
  rootId: string
  maxDepth: number
  nodePositions: Record<string, { x: number; y: number }>
  title?: string
  interactive?: boolean
  onNodeMove?: (id: string, x: number, y: number) => void
}

export default function PrintOrgChart({
  allNodes, personeMap, rootId, maxDepth, nodePositions,
  title, interactive = true, onNodeMove,
}: PrintOrgChartProps) {
  const subtree = buildSubtree(allNodes, rootId, maxDepth)

  // --- Leaf absorption BEFORE building tree ---
  // Per ogni nodo: trova i figli-foglia senza UO propria → li assorbe
  const subtreeIds = new Set(subtree.map(n => n.id))
  const childrenOf = new Map<string, NodoOrganigramma[]>()
  subtree.forEach(n => {
    if (n.reports_to && subtreeIds.has(n.reports_to)) {
      const arr = childrenOf.get(n.reports_to) ?? []
      arr.push(n)
      childrenOf.set(n.reports_to, arr)
    }
  })

  const absorbedIds = new Set<string>()
  const leafListByParent = new Map<string, NodoOrganigramma[]>()

  subtree.forEach(parent => {
    const children = childrenOf.get(parent.id) ?? []
    const sameNameLeaves = children.filter(c => {
      const isLeaf = (childrenOf.get(c.id) ?? []).length === 0
      return isLeaf && isSameUoLeaf(c, parent)
    })
    if (sameNameLeaves.length > 0) {
      sameNameLeaves.forEach(c => absorbedIds.add(c.id))
      leafListByParent.set(parent.id, sameNameLeaves)
    }
  })

  const subtreeForLayout = subtree.filter(n => !absorbedIds.has(n.id))

  const treeNodes = buildTree(subtreeForLayout, n => n.id, n => n.id === rootId ? null : n.reports_to)
  layoutTree(treeNodes, 0, {
    gridCols: 6,
    verticalStackingDepth: null,
    forcedVerticalNodes: new Set(),
    vGap: V_GAP,
    hGap: H_GAP,
  })

  const flatRaw = flattenTree(treeNodes)
  const flat: FlatNode[] = flatRaw.map(tn => {
    const override = nodePositions[tn.id]
    return {
      id: tn.id,
      parentId: tn.parentId,
      x: override ? override.x : tn.x,
      y: override ? override.y : tn.y,
      item: tn.item,
      leafList: leafListByParent.get(tn.id),
    }
  })

  const posMap = new Map(flat.map(n => [n.id, n]))
  const depthMap = new Map(flatRaw.map(tn => [tn.id, tn.depth]))

  // Bounding box (nodes can be taller with leaf list)
  let minX = 0, maxX = NODE_W, minY = 0, maxY = NODE_H
  if (flat.length > 0) {
    minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity
    flat.forEach(n => {
      const listH = n.leafList ? Math.min(n.leafList.length * 18 + 10, 200) : 0
      const nodeH = NODE_H + listH
      if (n.x < minX) minX = n.x
      if (n.x + NODE_W > maxX) maxX = n.x + NODE_W
      if (n.y < minY) minY = n.y
      if (n.y + nodeH > maxY) maxY = n.y + nodeH
    })
  }
  const pad = 24
  const naturalW = maxX - minX + pad * 2
  const naturalH = maxY - minY + pad * 2
  const offsetX = -minX + pad
  const offsetY = -minY + pad

  const chartAreaH = A4_H - HEADER_H
  const scale = interactive ? 1 : Math.min(A4_W / naturalW, chartAreaH / naturalH, 1)
  const scaledW = naturalW * scale
  const scaledH = naturalH * scale

  const dragging = useRef<{ id: string; startMouseX: number; startMouseY: number; startX: number; startY: number } | null>(null)
  const handleMouseDown = useCallback((e: React.MouseEvent, id: string, nodeX: number, nodeY: number) => {
    if (!interactive || !onNodeMove) return
    e.preventDefault()
    dragging.current = { id, startMouseX: e.clientX, startMouseY: e.clientY, startX: nodeX, startY: nodeY }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      onNodeMove(dragging.current.id, dragging.current.startX + ev.clientX - dragging.current.startMouseX, dragging.current.startY + ev.clientY - dragging.current.startMouseY)
    }
    const onUp = () => { dragging.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [interactive, onNodeMove])

  const pageTitle = title ?? allNodes.find(n => n.id === rootId)?.nome_uo ?? rootId

  // --- Connectors: bus-bar orthogonal ---
  // Group children by parent → draw shared horizontal bus at midY
  const connectorPaths: React.ReactNode[] = []
  const parentGroups = new Map<string, FlatNode[]>()
  flat.forEach(n => { if (n.parentId) { const arr = parentGroups.get(n.parentId) ?? []; arr.push(n); parentGroups.set(n.parentId, arr) } })

  parentGroups.forEach((children, parentId) => {
    const parent = posMap.get(parentId)
    if (!parent) return
    const parentListH = parent.leafList ? Math.min(parent.leafList.length * 18 + 10, 200) : 0
    const parentBottomY = parent.y + offsetY + NODE_H + parentListH

    // midY: halfway between parent bottom and topmost child
    const minChildY = Math.min(...children.map(c => c.y + offsetY))
    const midY = parentBottomY + (minChildY - parentBottomY) / 2

    const parentCenterX = parent.x + offsetX + NODE_W / 2

    // Vertical stem from parent down to midY
    connectorPaths.push(
      <line key={`stem-${parentId}`}
        x1={parentCenterX} y1={parentBottomY}
        x2={parentCenterX} y2={midY}
        stroke="#94a3b8" strokeWidth={1.5}
      />
    )

    if (children.length > 1) {
      // Horizontal bus spanning all children
      const xs = children.map(c => c.x + offsetX + NODE_W / 2)
      const busLeft = Math.min(...xs)
      const busRight = Math.max(...xs)
      connectorPaths.push(
        <line key={`bus-${parentId}`}
          x1={busLeft} y1={midY} x2={busRight} y2={midY}
          stroke="#94a3b8" strokeWidth={1.5}
        />
      )
    }

    // Vertical drop from midY to each child top
    children.forEach(c => {
      const cx = c.x + offsetX + NODE_W / 2
      const cy = c.y + offsetY
      connectorPaths.push(
        <line key={`drop-${c.id}`}
          x1={cx} y1={midY} x2={cx} y2={cy}
          stroke="#94a3b8" strokeWidth={1.5}
        />
      )
    })
  })

  const chartContent = (
    <div style={{ position: 'relative', width: naturalW, height: naturalH }}>
      <svg style={{ position: 'absolute', left: 0, top: 0, width: naturalW, height: naturalH, overflow: 'visible', pointerEvents: 'none' }}>
        {connectorPaths}
      </svg>

      {flat.map(n => {
        const persona = n.item.cf_persona ? personeMap.get(n.item.cf_persona) : null
        const personaName = persona ? `${persona.cognome ?? ''} ${persona.nome ?? ''}`.trim() || null : null
        const subtitle = n.item.job_title ?? n.item.funzione ?? null
        const isRoot = n.id === rootId
        const depth = depthMap.get(n.id) ?? 0
        const borderColor = isRoot ? '#1e3a5f' : depth === 1 ? '#3b82f6' : '#d1d5db'
        const headerBg = isRoot ? '#1e3a5f' : depth === 1 ? '#dbeafe' : '#f1f5f9'
        const headerTextColor = isRoot ? 'white' : '#0f172a'

        return (
          <div key={n.id}
            onMouseDown={e => handleMouseDown(e, n.id, n.x, n.y)}
            style={{
              position: 'absolute',
              left: n.x + offsetX,
              top: n.y + offsetY,
              width: NODE_W,
              border: `1.5px solid ${borderColor}`,
              borderRadius: 5,
              overflow: 'hidden',
              boxSizing: 'border-box',
              cursor: interactive && onNodeMove ? 'grab' : 'default',
              userSelect: 'none',
              fontFamily: '"Helvetica Neue", Arial, sans-serif',
              boxShadow: '0 1px 4px rgba(0,0,0,.09)',
              background: 'white',
            }}
          >
            {/* Header con nome UO */}
            <div style={{ background: headerBg, borderBottom: `1px solid ${borderColor}`, padding: '5px 8px' }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: headerTextColor, lineHeight: 1.3, wordBreak: 'break-word' }}>
                {n.item.nome_uo ?? n.id}
              </div>
            </div>

            {/* Persona titolare */}
            <div style={{ padding: '4px 8px 5px', background: 'white' }}>
              {personaName && (
                <div style={{ fontSize: 9.5, color: '#1e293b', fontWeight: 600, lineHeight: 1.3, marginBottom: 1 }}>{personaName}</div>
              )}
              {subtitle && (
                <div style={{ fontSize: 9, color: '#64748b', lineHeight: 1.3, fontStyle: 'italic' }}>{subtitle}</div>
              )}
              {!personaName && !subtitle && (
                <div style={{ fontSize: 9, color: '#cbd5e1' }}>—</div>
              )}
            </div>

            {/* Lista persone assorbite */}
            {n.leafList && n.leafList.length > 0 && (
              <div style={{ borderTop: '1px dashed #e2e8f0', padding: '3px 8px 5px', background: '#fafafa' }}>
                {n.leafList.slice(0, 10).map(leaf => {
                  const p = leaf.cf_persona ? personeMap.get(leaf.cf_persona) : null
                  const pName = p ? `${p.cognome ?? ''} ${p.nome ?? ''}`.trim() : null
                  return (
                    <div key={leaf.id} style={{ fontSize: 8.5, color: '#475569', lineHeight: 1.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: '#94a3b8', flexShrink: 0 }}>·</span>
                      <span>{pName ?? leaf.cf_persona ?? leaf.id}</span>
                    </div>
                  )
                })}
                {n.leafList.length > 10 && (
                  <div style={{ fontSize: 8, color: '#94a3b8', marginTop: 1 }}>+{n.leafList.length - 10} altri</div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const header = (
    <div style={{ height: HEADER_H, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', flexShrink: 0, background: '#1e3a5f' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 5, height: 30, background: '#60a5fa', borderRadius: 3, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 10, color: '#93c5fd', letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: 2 }}>
            Gruppo Il Sole 24 Ore — Organigramma
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{pageTitle}</div>
        </div>
      </div>
      <div style={{ textAlign: 'right' as const }}>
        <div style={{ fontSize: 10, color: '#93c5fd' }}>
          {new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>
        <div style={{ fontSize: 10, color: '#60a5fa', marginTop: 2 }}>
          Profondità: {maxDepth} livelli · {flat.length} nodi · {absorbedIds.size} persone in lista
        </div>
      </div>
    </div>
  )

  if (interactive) {
    return (
      <div style={{ fontFamily: '"Helvetica Neue", Arial, sans-serif', background: 'white', display: 'inline-block', minWidth: 400 }}>
        {header}
        <div style={{ padding: pad, background: 'white' }}>
          {flat.length === 0
            ? <div style={{ color: '#9ca3af', fontSize: 13, padding: 32 }}>Nessun nodo trovato</div>
            : chartContent}
        </div>
      </div>
    )
  }

  return (
    <div style={{ width: A4_W, height: A4_H + HEADER_H, background: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {header}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'white' }}>
        {flat.length === 0
          ? <div style={{ color: '#9ca3af', fontSize: 13 }}>Nessun nodo trovato</div>
          : (
            <div style={{ width: scaledW, height: scaledH, position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, width: naturalW, height: naturalH, transformOrigin: 'top left', transform: `scale(${scale})` }}>
                {chartContent}
              </div>
            </div>
          )
        }
      </div>
    </div>
  )
}
