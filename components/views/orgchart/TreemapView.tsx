'use client'
import React, { useMemo, useState } from 'react'
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts'
import type { NodoOrganigramma, Persona } from '@/types'

// -- Dati Treemap --
export interface TreemapNode {
  [key: string]: any; // Allow indexing to satisfy recharts TreemapDataType
  name: string
  value?: number
  id: string
  children?: TreemapNode[]
  data: NodoOrganigramma | null
}

interface TreemapViewProps {
  data: NodoOrganigramma[] // La root gerarchica o l'elenco dei nodi
  rootId?: string // L'id della radice se siamo in drill (altrimenti root virtuale)
  onNodeClick?: (id: string, name: string) => void
}

/** 
 * Customized Content per ogni rettangolo della Treemap
 */
const CustomTreemapContent = (props: any) => {
  const { root, depth, x, y, width, height, index, name, value, bgColors } = props
  
  if (width < 30 || height < 20) return null // Nascondi se troppo piccolo

  // Generiamo un colore in base alla profondità e all'indice
  const hue = ((depth * 40) + (index * 15)) % 360
  // Più profondo = più scuro in un tema scuro, 
  // depth 1: lightness 35%, depth 2: 25%, ecc.
  const lightness = Math.max(15, 45 - depth * 10)
  const fill = `hsl(${hue}, 60%, ${lightness}%)`

  const border = `hsl(${hue}, 60%, ${lightness + 20}%)`

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        style={{
          fill,
          stroke: border,
          strokeWidth: 2 / (depth + 1), // Bordi più sottili man mano che si scende
          cursor: 'pointer',
          transition: 'fill 0.2s',
        }}
        onMouseEnter={(e: any) => { e.target.style.fill = `hsl(${hue}, 70%, ${lightness + 10}%)` }}
        onMouseLeave={(e: any) => { e.target.style.fill = fill }}
        onClick={() => {
          if (props.onNodeClick && props.id) {
            props.onNodeClick(props.id, name)
          }
        }}
      />
      {/* Testo solo se c'è spazio sufficiente */}
      {width > 60 && height > 35 && (
        <>
          <text
            x={x + 6}
            y={y + 16}
            fill="#e2e8f0" // slate-200
            fontSize={Math.max(10, Math.min(14, width / 10))}
            fontWeight="bold"
            className="pointer-events-none select-none"
          >
            {name?.length > 25 ? name.substring(0, 25) + '...' : name}
          </text>
          {width > 80 && height > 50 && (
            <text
              x={x + 6}
              y={y + 32}
              fill="#94a3b8" // slate-400
              fontSize={10}
              className="pointer-events-none select-none"
            >
              Peso: {value}
            </text>
          )}
        </>
      )}
    </g>
  )
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs z-50 pointer-events-none">
        <p className="font-bold text-slate-100 mb-1">{data.name}</p>
        <p className="text-slate-400">Dimensione: <span className="text-slate-200 font-medium">{data.value}</span></p>
        {data.id && <p className="text-slate-500 font-mono mt-1 text-[10px]">{data.id}</p>}
      </div>
    )
  }
  return null
}

export default function TreemapView({ data, rootId, onNodeClick }: TreemapViewProps) {
  
  // Costruisce l'albero per la Treemap
  const treemapData = useMemo(() => {
    if (!data || data.length === 0) return []

    const nodesMap = new Map<string, TreemapNode>()
    
    // Inizializza i nodi
    data.forEach(n => {
      nodesMap.set(n.id, {
        id: n.id,
        name: n.nome_uo || n.id,
        value: 1, // Base value (peso nodo stesso)
        children: [],
        data: n
      })
    })

    const roots: TreemapNode[] = []

    // Popola i children
    data.forEach(n => {
      const parentId = n.reports_to
      const tmNode = nodesMap.get(n.id)!
      
      // Se abbiamo un drillRootId specifico, trattiamo le radici che NON hanno il parent_id (o ce l'hanno fuori dati)
      if (parentId && nodesMap.has(parentId)) {
        nodesMap.get(parentId)!.children!.push(tmNode)
      } else {
        roots.push(tmNode)
      }
    })

    // Funzione per calcolare il "value" dei nodi foglia (o propagare pesi)
    // Se un nodo ha figli, `recharts` calcola automaticamente il size sommando i children 
    // se non gli passiamo un `value` fisso forzato al padre, oppure possiamo propagarlo manualmente.
    // In questo caso, assegniamo un value di default (1) ai nodi senza figli, 
    // e per i padri rimuoviamo il parametro value, così Recharts somma i figli.
    const cleanValues = (node: TreemapNode) => {
      if (node.children && node.children.length > 0) {
        node.children.forEach(cleanValues)
        // RIMUOVIAMO il value dal padre affinché Recharts lo calcoli auto-sommando i children
        delete (node as any).value
      } else {
        // Foglia
        node.value = 1 
        delete node.children // rimuoviamo array vuoto
      }
    }

    roots.forEach(cleanValues)

    // Se c'è rootId cerchiamo di restituire il sottoalbero focalizzato
    if (rootId && nodesMap.has(rootId)) {
        const rootNode = nodesMap.get(rootId)!
        return [rootNode]
    }

    // Altrimenti restituiamo virtual root o array di radici multiple (Recharts accetta un array di 1 o più root)
    if (roots.length === 1) {
        return roots
    }
    
    return [{
        name: 'Azienda',
        children: roots,
        id: 'virtual-root',
        data: null as any
    }]
  }, [data, rootId])

  if (!treemapData || treemapData.length === 0) {
    return <div className="p-8 text-center text-slate-500">Nessun dato per Treemap</div>
  }

  return (
    <div className="w-full h-full bg-slate-950 p-4">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={treemapData}
          dataKey="value"
          aspectRatio={4 / 3}
          stroke="#fff"
          fill="#8884d8"
          isAnimationActive={true}
          animationDuration={600}
          content={<CustomTreemapContent onNodeClick={onNodeClick} />}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  )
}
