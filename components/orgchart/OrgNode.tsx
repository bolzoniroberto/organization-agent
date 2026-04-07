'use client'
import React, { memo } from 'react'
import { Handle, Position, useStore } from '@xyflow/react'

export interface OrgNodeData {
  id: string
  label: string
  sublabel?: string | null
  extraDetail?: string | null
  tipo?: 'STRUTTURA' | 'PERSONA' | 'ANOMALIA' | 'TNS' | 'TIMESHEET'
  collapsed: boolean
  hasChildren: boolean
  childrenCount: number
  depth: number
  isOverflowed: boolean
  hiddenCount: number
  colorScheme?: { border: string; bg: string }
  semanticStatus?: 'active' | 'indirect' | 'empty'
  alertDots?: { color: string; title: string }[]
  entranceDelay?: number
  compact?: boolean
  directReports?: number
  totalReports?: number
  /** Ancestor chip: renders as a slim breadcrumb chip in the drill ancestry chain */
  isAncestor?: boolean
  onExpand: () => void
  onExpandOverflow: () => void
  onOpenDrawer: () => void
  onDropPerson?: (cf: string) => void
  /** Nodi foglia assorbiti inline (leafListMode) */
  leafList?: Array<{ id: string; label: string; sublabel?: string; tipo?: string; onOpenDrawer: () => void }>
  /** Persone raggruppate con stesso nome UO (groupByName) */
  groupedPersons?: Array<{ id: string; label: string; sublabel?: string; onOpenDrawer: () => void }>
}

const SEMANTIC_BORDER: Record<string, string> = {
  active:   '#22c55e',
  indirect: '#f59e0b',
  empty:    '#334155',
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

const NODE_W = 240

const OrgNode = memo(function OrgNode({ data, selected }: OrgNodeProps) {
  const {
    label, sublabel, extraDetail, tipo, collapsed, hasChildren, childrenCount, depth,
    isOverflowed, hiddenCount, colorScheme, semanticStatus, alertDots, entranceDelay, compact,
    isAncestor, directReports, totalReports,
    onExpand, onExpandOverflow, onOpenDrawer, onDropPerson, leafList, groupedPersons
  } = data

  const dropHandlers = onDropPerson ? {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const cf = e.dataTransfer.getData('person-cf')
      if (cf) onDropPerson(cf)
    }
  } : {}
  const isRoot = depth === 0
  const tipoColor = tipo ? (TIPO_COLORS[tipo] ?? TIPO_COLORS.STRUTTURA) : TIPO_COLORS.STRUTTURA
  const isLeaf = !hasChildren

  const lod = useStore(s => {
    const z = s.transform[2]
    return z <= 0.4 ? 'macro' : z <= 0.8 ? 'standard' : 'micro'
  })

  const entranceStyle: React.CSSProperties = entranceDelay !== undefined
    ? { animation: `nodeEnter 250ms cubic-bezier(0.4,0,0.2,1) ${entranceDelay}ms both` }
    : {}

  const leftBorder = colorScheme?.border
    ?? (semanticStatus ? SEMANTIC_BORDER[semanticStatus] : undefined)

  const colorStyles: React.CSSProperties = leftBorder
    ? { borderColor: leftBorder, borderWidth: 2, backgroundColor: colorScheme?.bg ?? '#1e293b' }
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

  // ── Ancestor chip (drill chain, compressed) ───────────────────────────────
  if (isAncestor) {
    return (
      <div
        className="relative rounded select-none bg-slate-900/80 border border-slate-700 hover:border-slate-500 hover:bg-slate-800 transition-all duration-100 cursor-pointer"
        style={{ width: NODE_W, height: 32, ...entranceStyle }}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
        title={label}
      >
        <Handle type="target" position={Position.Top} className="!bg-slate-600 !w-1.5 !h-1.5" />
        <div className="px-2 h-full flex items-center gap-1.5 overflow-hidden">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tipoColor.dot} opacity-60`} />
          <span className="text-xs text-slate-400 truncate flex-1">{label}</span>
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-slate-600 !w-1.5 !h-1.5" />
      </div>
    )
  }

  // ── Compact ──────────────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className={containerClasses}
        style={{ width: 180, height: 40, ...colorStyles, ...entranceStyle }}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
        {...dropHandlers}
      >
        <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-1.5 !h-1.5" />
        <div className="px-2 py-1 flex items-center justify-center gap-1.5 h-full">
          <span className="font-semibold text-slate-100 overflow-hidden flex-1 text-center"
            style={{ fontSize: 11, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
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
        style={{ width: NODE_W, minHeight: 56, ...colorStyles, ...entranceStyle }}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
        {...dropHandlers}
      >
        <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />
        <div className="px-3 py-2 flex items-center justify-center gap-2 h-full">
          <span className="font-semibold text-white overflow-hidden flex-1 text-center"
            style={{ fontSize: 12, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
            {label}
          </span>
          {alertDots?.map((a, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 bg-${a.color}-400`} title={a.title} />)}
        </div>
        <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
        {expandButton}
      </div>
    )
  }

  // ── Leaf (nodo senza figli) — standard/micro ──────────────────────────────────
  if (isLeaf) {
    const hasList = (leafList && leafList.length > 0) || (groupedPersons && groupedPersons.length > 0)
    return (
      <div className={containerClasses}
        style={{ width: NODE_W, minHeight: 56, ...colorStyles, ...entranceStyle }}
        onDoubleClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
        {...dropHandlers}
      >
        <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />

        {alertDots && alertDots.length > 0 && (
          <div className="absolute top-1.5 right-1.5 flex gap-1">
            {alertDots.map((a, i) => (
              <span key={i} className={`w-2 h-2 rounded-full bg-${a.color}-400`} title={a.title} />
            ))}
          </div>
        )}

        <div className="px-3 py-1.5 flex flex-col gap-0.5 items-center">
          <div className="font-bold text-white leading-snug overflow-hidden text-center w-full"
            style={{ fontSize: 14, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
            {label}
          </div>
          {sublabel && (
            <div className="text-slate-200 truncate text-center w-full" style={{ fontSize: 11 }}>{sublabel}</div>
          )}
        </div>

        {lod === 'micro' && extraDetail && !hasList && (
          <div className="px-3 pb-1.5 pt-1 border-t border-slate-700">
            <div className="text-slate-400 truncate" style={{ fontSize: 10 }}>{extraDetail}</div>
          </div>
        )}

        {/* Persone raggruppate (groupByName) */}
        {groupedPersons && groupedPersons.length > 0 && (
          <div className="border-t border-slate-700/60 max-h-36 overflow-y-auto">
            {groupedPersons.map(p => (
              <button key={p.id} onClick={(e) => { e.stopPropagation(); p.onOpenDrawer() }}
                className="w-full text-left px-3 py-0.5 hover:bg-slate-700/50 flex items-center gap-1.5 transition-colors">
                <span className="w-1 h-1 rounded-full bg-indigo-400 flex-shrink-0" />
                <span className="flex-1 truncate text-slate-300" style={{ fontSize: 11 }}>{p.label}</span>
                {p.sublabel && <span className="text-slate-500 font-mono truncate" style={{ fontSize: 10, maxWidth: 56 }}>{p.sublabel}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Foglie assorbite inline (leafListMode) */}
        {leafList && leafList.length > 0 && (
          <div className="border-t border-slate-700/60 max-h-48 overflow-y-auto">
            <div className="px-3 py-0.5 text-slate-500 select-none" style={{ fontSize: 9 }}>
              {leafList.length} diretti
            </div>
            {leafList.map(leaf => (
              <button key={leaf.id} onClick={(e) => { e.stopPropagation(); leaf.onOpenDrawer() }}
                className="w-full text-left px-3 py-0.5 hover:bg-slate-700/50 flex items-center gap-1 transition-colors">
                {leaf.tipo && <span className={`w-1 h-1 rounded-full flex-shrink-0 ${TIPO_COLORS[leaf.tipo]?.dot ?? 'bg-slate-400'}`} />}
                <span className="flex-1 truncate text-slate-300" style={{ fontSize: 11 }}>{leaf.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Standard / Micro (nodo con figli) ────────────────────────────────────────
  return (
    <div className={containerClasses}
      style={{ width: NODE_W, minHeight: 64, ...colorStyles, ...entranceStyle }}
      onDoubleClick={(e) => { e.stopPropagation(); onOpenDrawer() }}
      {...dropHandlers}
    >
      <Handle type="target" position={Position.Top} className="!bg-slate-500 !w-2 !h-2" />

      {alertDots && alertDots.length > 0 && (
        <div className="absolute top-2 right-2 flex gap-1">
          {alertDots.map((a, i) => (
            <span key={i} className={`w-2 h-2 rounded-full bg-${a.color}-400`} title={a.title} />
          ))}
        </div>
      )}

      <div className="px-3 py-1.5 flex flex-col gap-0.5 items-center">
        <div className="font-bold text-white leading-snug overflow-hidden text-center w-full"
          style={{ fontSize: 14, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
          {label}
        </div>
        {sublabel && (
          <div className="text-slate-200 truncate text-center w-full" style={{ fontSize: 12 }}>{sublabel}</div>
        )}
      </div>

      {lod === 'micro' && extraDetail && (
        <div className="px-3 pb-2 pt-1 border-t border-slate-700">
          <div className="text-slate-400 truncate" style={{ fontSize: 10 }}>{extraDetail}</div>
        </div>
      )}

      {directReports !== undefined && (
        <div className="flex items-center justify-between px-3 pb-1 border-t border-slate-700/50 mt-1">
          <span className="text-slate-500" style={{fontSize:9}}>
            ↓ {directReports} diretti
          </span>
          {totalReports !== undefined && totalReports > directReports && (
            <span className="text-slate-600" style={{fontSize:9}}>
              ⊹ {totalReports} totali
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-slate-500 !w-2 !h-2" />
      {expandButton}
    </div>
  )
})

export default OrgNode
