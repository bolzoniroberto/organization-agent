'use client'
import React, { useRef, useCallback } from 'react'
import type { NodoOrganigramma, Persona } from '@/types'
import { buildTree, layoutTree, flattenTree, getBoundingBox } from '@/lib/orgchart-layout'

const NODE_W = 200
const NODE_H = 80
const H_GAP = 220
const V_GAP = 120

interface FlatNode {
  id: string
  parentId: string | null
  x: number
  y: number
  item: NodoOrganigramma
}

function buildSubtree(
  allNodes: NodoOrganigramma[],
  rootId: string,
  maxDepth: number
): NodoOrganigramma[] {
  const result: NodoOrganigramma[] = []
  function collect(id: string, depth: number) {
    const node = allNodes.find(n => n.id === id)
    if (!node) return
    result.push(node)
    if (depth < maxDepth) {
      allNodes.filter(n => n.reports_to === id).forEach(c => collect(c.id, depth + 1))
    }
  }
  collect(rootId, 0)
  return result
}

export interface PrintOrgChartProps {
  allNodes: NodoOrganigramma[]
  personeMap: Map<string, Persona>
  rootId: string
  maxDepth: number
  nodePositions: Record<string, { x: number; y: number }>
  onNodeMove?: (id: string, x: number, y: number) => void
  interactive?: boolean
}

export default function PrintOrgChart({
  allNodes,
  personeMap,
  rootId,
  maxDepth,
  nodePositions,
  onNodeMove,
  interactive = true,
}: PrintOrgChartProps) {
  const subtree = buildSubtree(allNodes, rootId, maxDepth)
  const treeNodes = buildTree(subtree, n => n.id, n => n.reports_to)
  layoutTree(treeNodes, 0, {
    gridCols: 6,
    verticalStackingDepth: null,
    forcedVerticalNodes: new Set(),
    vGap: V_GAP,
  })

  const flat = flattenTree(treeNodes).map(tn => {
    const override = nodePositions[tn.id]
    return {
      id: tn.id,
      parentId: tn.parentId,
      x: override ? override.x : tn.x,
      y: override ? override.y : tn.y,
      item: tn.item,
    } as FlatNode
  })

  const posMap = new Map(flat.map(n => [n.id, n]))

  // Bounding box with overrides applied
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  flat.forEach(n => {
    if (n.x < minX) minX = n.x
    if (n.x + NODE_W > maxX) maxX = n.x + NODE_W
    if (n.y < minY) minY = n.y
    if (n.y + NODE_H > maxY) maxY = n.y + NODE_H
  })
  const pad = 32
  const width = maxX - minX + pad * 2
  const height = maxY - minY + pad * 2
  const offsetX = -minX + pad
  const offsetY = -minY + pad

  const dragging = useRef<{ id: string; startMouseX: number; startMouseY: number; startX: number; startY: number } | null>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent, id: string, nodeX: number, nodeY: number) => {
    if (!interactive || !onNodeMove) return
    e.preventDefault()
    dragging.current = { id, startMouseX: e.clientX, startMouseY: e.clientY, startX: nodeX, startY: nodeY }
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const dx = ev.clientX - dragging.current.startMouseX
      const dy = ev.clientY - dragging.current.startMouseY
      onNodeMove(dragging.current.id, dragging.current.startX + dx, dragging.current.startY + dy)
    }
    const onUp = () => {
      dragging.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [interactive, onNodeMove])

  return (
    <div style={{ position: 'relative', width, height, background: 'white' }}>
      {/* SVG lines */}
      <svg style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none' }}>
        {flat.map(n => {
          if (!n.parentId) return null
          const parent = posMap.get(n.parentId)
          if (!parent) return null
          const x1 = parent.x + offsetX + NODE_W / 2
          const y1 = parent.y + offsetY + NODE_H
          const x2 = n.x + offsetX + NODE_W / 2
          const y2 = n.y + offsetY
          const mx = (y1 + y2) / 2
          return (
            <path
              key={n.id}
              d={`M${x1},${y1} C${x1},${mx} ${x2},${mx} ${x2},${y2}`}
              stroke="#9ca3af"
              strokeWidth={1.5}
              fill="none"
            />
          )
        })}
      </svg>

      {/* Nodes */}
      {flat.map(n => {
        const persona = n.item.cf_persona ? personeMap.get(n.item.cf_persona) : null
        const personaName = persona
          ? `${persona.cognome ?? ''} ${persona.nome ?? ''}`.trim()
          : null
        const subtitle = n.item.job_title ?? n.item.funzione ?? null

        return (
          <div
            key={n.id}
            onMouseDown={e => handleMouseDown(e, n.id, n.x, n.y)}
            style={{
              position: 'absolute',
              left: n.x + offsetX,
              top: n.y + offsetY,
              width: NODE_W,
              minHeight: NODE_H,
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              padding: '8px 10px',
              boxSizing: 'border-box',
              cursor: interactive && onNodeMove ? 'grab' : 'default',
              userSelect: 'none',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            }}
          >
            {/* nome_uo */}
            <div style={{ fontWeight: 700, fontSize: 12, color: '#111827', lineHeight: 1.3, marginBottom: 3 }}>
              {n.item.nome_uo ?? n.id}
            </div>
            {/* persona */}
            {personaName && (
              <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.3, marginBottom: 2 }}>
                {personaName}
              </div>
            )}
            {/* subtitle */}
            {subtitle && (
              <div style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.3 }}>
                {subtitle}
              </div>
            )}
            {/* tipo_nodo badge */}
            {n.item.tipo_nodo && n.item.tipo_nodo !== 'STRUTTURA' && (
              <span style={{
                display: 'inline-block', marginTop: 4, fontSize: 9,
                padding: '1px 5px', borderRadius: 3,
                background: n.item.tipo_nodo === 'PERSONA' ? '#dbeafe' : '#fee2e2',
                color: n.item.tipo_nodo === 'PERSONA' ? '#1d4ed8' : '#b91c1c',
                fontWeight: 600,
              }}>
                {n.item.tipo_nodo}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
