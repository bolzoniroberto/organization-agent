'use client'
import React, { useMemo, useState, useEffect, useRef } from 'react'
import * as d3 from 'd3-hierarchy'
import type { NodoOrganigramma } from '@/types'

export interface HierarchyNodeData {
  id: string
  name: string
  value?: number
  children?: HierarchyNodeData[]
  data: NodoOrganigramma | null
}

interface TreemapViewProps {
  data: NodoOrganigramma[]
  rootId?: string
  selectedNodeId?: string
  onNodeClick?: (id: string, name: string) => void
  onNodeContextMenu?: (e: React.MouseEvent, nodeId: string) => void
  colorMode?: string  // 'none' = standard neutro
  getNodeColor?: (n: NodoOrganigramma) => { border: string; bg: string } | undefined
}

export default function TreemapView({ data, rootId, selectedNodeId, onNodeClick, onNodeContextMenu, colorMode = 'none', getNodeColor }: TreemapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [hoveredNode, setHoveredNode] = useState<d3.HierarchyRectangularNode<HierarchyNodeData> | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect
        setDimensions({ width, height })
      }
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const hierarchyData = useMemo(() => {
    if (!data || data.length === 0) return null
    const nodesMap = new Map<string, HierarchyNodeData>()
    data.forEach(n => {
      nodesMap.set(n.id, { id: n.id, name: n.nome_uo || n.id, children: [], data: n })
    })
    const roots: HierarchyNodeData[] = []
    data.forEach(n => {
      const tmNode = nodesMap.get(n.id)!
      if (n.reports_to && nodesMap.has(n.reports_to)) {
        nodesMap.get(n.reports_to)!.children!.push(tmNode)
      } else {
        roots.push(tmNode)
      }
    })
    let finalRoot: HierarchyNodeData
    if (rootId && nodesMap.has(rootId)) {
      finalRoot = nodesMap.get(rootId)!
    } else if (roots.length === 1) {
      finalRoot = roots[0]
    } else {
      finalRoot = { name: 'Azienda', id: 'virtual-root', children: roots, data: null }
    }
    return d3.hierarchy<HierarchyNodeData>(finalRoot)
      .sum(d => (d.children && d.children.length > 0) ? 0 : 1)
      .sort((a, b) => (b.value || 0) - (a.value || 0))
  }, [data, rootId])

  const partitionLayout = useMemo(() => {
    if (!hierarchyData || dimensions.width === 0 || dimensions.height === 0) return []
    const partition = d3.partition<HierarchyNodeData>()
      .size([dimensions.width, dimensions.height])
      .padding(1)
    return partition(hierarchyData).descendants()
  }, [hierarchyData, dimensions])

  if (!data || data.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-slate-500">Nessun dato per Treemap</div>
  }

  return (
    <div className="w-full h-full bg-slate-950 p-4 relative" ref={containerRef}>
      {dimensions.width > 0 && dimensions.height > 0 && partitionLayout.length > 0 && (
        <svg width={dimensions.width} height={dimensions.height} className="block">
          {partitionLayout.map((node, index) => {
            const width = Math.max(0, node.x1 - node.x0)
            const height = Math.max(0, node.y1 - node.y0)
            const depth = node.depth
            const isHovered = hoveredNode?.data?.id === node.data.id
            const isSelected = selectedNodeId && node.data.id === selectedNodeId
            const isLeaf = !node.children || node.children.length === 0

            // Colore semantico: solo foglie se colorMode attivo
            const semanticColor = colorMode !== 'none' && isLeaf && node.data.data
              ? getNodeColor?.(node.data.data)
              : undefined

            let fill: string
            let stroke: string
            let strokeWidth = isSelected ? 2 : 1

            if (semanticColor) {
              fill = isSelected ? semanticColor.border : isHovered ? semanticColor.border + 'cc' : semanticColor.bg
              stroke = isSelected ? '#818cf8' : semanticColor.border
            } else {
              // Schema neutro — slate, varia solo per profondità
              const baseL = Math.max(12, 30 - depth * 5)
              const hoverL = baseL + 8
              const selL   = baseL + 18
              fill = isSelected
                ? `hsl(220, 25%, ${selL}%)`
                : isHovered
                  ? `hsl(220, 20%, ${hoverL}%)`
                  : `hsl(220, 15%, ${baseL}%)`
              stroke = isSelected ? '#818cf8' : `hsl(220, 20%, ${baseL + 12}%)`
            }

            return (
              <g
                key={node.data?.id || 'key-' + index}
                transform={`translate(${node.x0},${node.y0})`}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => {
                  if (onNodeClick && node.data?.id && node.data.id !== 'virtual-root') {
                    onNodeClick(node.data.id, node.data.name)
                  }
                }}
                onContextMenu={(e) => {
                  if (onNodeContextMenu && node.data?.id && node.data.id !== 'virtual-root') {
                    e.preventDefault()
                    onNodeContextMenu(e, node.data.id)
                  }
                }}
                className={node.data?.id !== 'virtual-root' ? 'cursor-pointer' : ''}
              >
                <rect
                  width={width}
                  height={height}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  className="transition-colors duration-150"
                />
                {width > 32 && height > 28 && node.data?.name && (
                  <>
                    <text x={6} y={15}
                      fill={isSelected ? '#e0e7ff' : '#f8fafc'}
                      fontSize={Math.max(9, Math.min(12, width / 14))}
                      fontWeight={isSelected ? '700' : '600'}
                      className="pointer-events-none select-none drop-shadow-md"
                    >
                      {node.data.name.length > (width / 7)
                        ? node.data.name.substring(0, Math.max(4, Math.floor(width / 7))) + '…'
                        : node.data.name}
                    </text>
                    <text x={6} y={27} fill={isSelected ? '#c7d2fe' : '#94a3b8'} fontSize={9}
                      className="pointer-events-none select-none">
                      {node.value} {node.value === 1 ? 'persona' : 'persone'}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
      )}

      {hoveredNode && hoveredNode.data?.id !== 'virtual-root' && (
        <div
          className="absolute pointer-events-none bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-2xl text-xs z-50 transform -translate-x-1/2 -translate-y-full mb-2"
          style={{ left: (hoveredNode.x0 + hoveredNode.x1) / 2 + 16, top: hoveredNode.y0 + 10 }}
        >
          <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-slate-700" />
          <div className="absolute -bottom-[7px] left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-transparent border-t-slate-900" />
          <p className="font-bold text-slate-100 mb-1">{hoveredNode.data?.name}</p>
          <p className="text-slate-400">Persone: <span className="text-slate-200 font-medium">{hoveredNode.value}</span></p>
          {hoveredNode.data?.id && <p className="text-slate-500 font-mono mt-1 text-[10px] uppercase">{hoveredNode.data.id}</p>}
          {onNodeContextMenu && <p className="text-slate-600 mt-1">Tasto destro per opzioni</p>}
        </div>
      )}
    </div>
  )
}
