'use client'
import React, { memo } from 'react'
import { Handle, Position, useStore } from '@xyflow/react'
import { ChevronRight } from 'lucide-react'

export interface OrgNodeData {
  id: string
  label: string
  sublabel?: string | null
  extraDetail?: string | null          // micro LOD third line
  tipo?: 'STRUTTURA' | 'PERSONA' | 'ANOMALIA' | 'TNS' | 'TIMESHEET'
  collapsed: boolean
  hasChildren: boolean
  childrenCount: number
  depth: number
  isOverflowed: boolean
  hiddenCount: number
  colorScheme?: { border: string; bg: string }
  /** Semantic status when no colorScheme: active=verde, indirect=giallo, empty=grigio */
  semanticStatus?: 'active' | 'indirect' | 'empty'
  alertDots?: { color: string; title: string }[]
  entranceDelay?: number
  compact?: boolean
  onExpand: () => void
  onExpandOverflow: () => void
  onOpenDrawer: () => void
}

const SEMANTIC_BORDER: Record<string, string> = {
  active:   '#22c55e',   // verde — dipendenti diretti
  indirect: '#f59e0b',   // ambra — dipendenti solo nei rami sottostanti
  empty:    '#334155',   // grigio slate — nessun dipendente
}

interface OrgNodeProps {
  data: OrgNodeData
  selected: boolean
}

const TIPO_COLORS: Record<string, { dot: string; border: string }> = {
  STRUTTURA: { dot: 'bg-slate-400',   border: 'border-slate-600' },
  PERSONA:   { dot: 'bg-indigo-400',  border: 'border-indigo-700' },
  ANOMALIA:  { dot: 'bg-amber-400',   border: 'border-amber-600' },
  TNS:       { dot: 'bg-green-400',   border: 'border-green-700' },
  TIMESHEET: { dot: 'bg-purple-400',  border: 'border-purple-700' },
}

const OrgNode = memo(function OrgNode({ data, selected }: OrgNodeProps) {
  const {
    label, sublabel, extraDetail, tipo, collapsed, hasChildren, childrenCount, depth,
    isOverflowed, hiddenCount, colorScheme, semanticStatus, alertDots, entranceDelay, compact,
    onExpand, onExpandOverflow, onOpenDrawer
  } = data
  const isRoot = depth === 0
  const tipoColor = tipo ? (TIPO_COLORS[tipo] ?? TIPO_COLORS.STRUTTURA) : TIPO_COLORS.STRUTTURA

  const lod = useStore(s => {
    const z = s.transform[2]
    return z <= 0.4 ? 'macro' : z <= 0.8 ? 'standard' : 'micro'
  })

  const entranceStyle: React.CSSProperties = entranceDelay !== undefined
    ? { animation: `nodeEnter 250ms cubic-bezier(0.4,0,0.2,1) ${entranceDelay}ms both` }
    : {}

  // colorScheme (da dropdown) ha priorità; altrimenti usa colore semantico
  const leftBorder = colorScheme?.border
    ?? (semanticStatus ? SEMANTIC_BORDER[semanticStatus] : undefined)

  const colorStyles: React.CSSProperties = leftBorder
    ? { borderLeftColor: leftBorder, borderLeftWidth: 4, backgroundColor: '#1e293b' }
    : {}

  const containerClasses = [
    'relative rounded-lg shadow-sm select-none transition-all duration-150',
    'bg-slate-800 text-slate-200',
    isRoot ? 'border-2 border-indigo-500' : `border ${tipoColor.border}`,
    selected ? 'ring-2 ring-indigo-400 shadow-lg' : 'hover:shadow-lg hover:border-slate-500'
  ].join(' ')

  const expandButton = hasChildren ? (
    collapsed ? (
      <button
        onClick={(e) => { e.stopPropagation(); onExpand() }}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded hover:bg-slate-600 transition-colors border border-slate-500"
        style={{ fontSize: 11 }}
      >
        +{childrenCount}
      </button>
    ) : isOverflowed ? (
      <button
        onClick={(e) => { e.stopPropagation(); onExpandOverflow() }}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-amber-900/50 text-amber-300 text-xs px-2 py-0.5 rounded hover:bg-amber-800/50 transition-colors border border-amber-700 whitespace-nowrap"
        style={{ fontSize: 11 }}
        title={`Mostra altri ${hiddenCount}`}
      >
        ···+{hiddenCount}
      </button>
    ) : (
      <button
        onClick={(e) => { e.stopPropagation(); onExpand() }}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-indigo-900/50 text-indigo-300 text-xs px-2 py-0.5 rounded hover:bg-indigo-800/50 transition-colors border border-indigo-700"
        style={{ fontSize: 11 }}
      >
        −
      </button>
    )
  ) : null

  // ── Compact ──────────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className={containerClasses}
        style={{ width: 160, height: 50, ...colorStyles, ...entranceStyle }}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
      >
        <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-1.5 !h-1.5" />
        <div className="px-2 py-1 flex items-center gap-1.5 h-full">
          <span className="font-medium text-slate-200 overflow-hidden flex-1"
            style={{ fontSize: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {label}
          </span>
          {alertDots?.map((a, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-${a.color}-400`} title={a.title} />)}
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-1.5 !h-1.5" />
        {expandButton}
      </div>
    )
  }

  // ── Macro ─────────────────────────────────────────────────────────────────────
  if (lod === 'macro') {
    return (
      <div className={containerClasses}
        style={{ width: 220, minHeight: 60, ...colorStyles, ...entranceStyle }}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
      >
        <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />
        <div className="px-3 py-2 flex items-center gap-2 h-full">
          <span className="font-medium text-slate-200 overflow-hidden flex-1"
            style={{ fontSize: 11, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {label}
          </span>
          {alertDots?.map((a, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-${a.color}-400`} title={a.title} />)}
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
        {expandButton}
      </div>
    )
  }

  // ── Standard / Micro ─────────────────────────────────────────────────────────
  return (
    <div className={containerClasses}
      style={{ width: 220, minHeight: 90, ...colorStyles, ...entranceStyle }}
      onDoubleClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />

      {alertDots && alertDots.length > 0 && (
        <div className="absolute top-2 right-2 flex gap-1">
          {alertDots.map((a, i) => (
            <span key={i} className={`w-2 h-2 rounded-full bg-${a.color}-400`} title={a.title} />
          ))}
        </div>
      )}

      <div className="px-3 py-2.5 flex flex-col gap-1">
        {tipo && (
          <div className="flex items-center gap-1 mb-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${tipoColor.dot} flex-shrink-0`} />
            <span className="text-slate-500 uppercase tracking-wide" style={{ fontSize: 9 }}>{tipo}</span>
          </div>
        )}
        <div className="font-semibold text-slate-100 leading-snug overflow-hidden"
          style={{ fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {label}
        </div>
        {sublabel && (
          <div className="text-slate-400 truncate" style={{ fontSize: 11 }}>{sublabel}</div>
        )}
        <div className="flex items-center justify-between mt-0.5">
          {hasChildren && <span className="text-slate-500 text-xs">{childrenCount}</span>}
          <div className="flex-1" />
          <button
            onClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
            className="text-slate-600 hover:text-slate-300 transition-colors"
            title="Apri dettaglio"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Micro LOD: extra detail row */}
      {lod === 'micro' && extraDetail && (
        <div className="px-3 pb-2 pt-1 border-t border-slate-700">
          <div className="text-slate-500 truncate" style={{ fontSize: 10 }}>{extraDetail}</div>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
      {expandButton}
    </div>
  )
})

export default OrgNode
