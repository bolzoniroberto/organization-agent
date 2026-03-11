'use client'
import React from 'react'
import { X } from 'lucide-react'
import type { VariabileOrgDefinizione } from '@/types'

interface ColumnsPanelProps {
  entityType: 'nodi' | 'persone' | 'tns' | 'strutture-tns'
  allColumns: { field: string; label: string }[]
  visibleColumns: Set<string>
  onToggle: (field: string) => void
  onReset: () => void
  onClose: () => void
  variabili: VariabileOrgDefinizione[]
  visibleVars: Set<number>
  onToggleVar: (varId: number) => void
}

const ENTITY_VAR_TARGET: Record<string, string> = {
  nodi: 'nodo',
  persone: 'persona',
  tns: 'tns',
  'strutture-tns': 'struttura_tns',
}

export default function ColumnsPanel({
  allColumns, visibleColumns, onToggle, onReset, onClose,
  variabili, visibleVars, onToggleVar, entityType
}: ColumnsPanelProps) {
  const varTarget = ENTITY_VAR_TARGET[entityType]
  const compatibleVars = variabili.filter(v =>
    v.target === 'tutti' || v.target === varTarget
  )

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative ml-auto w-72 h-full bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-200">Colonne visibili</span>
          <div className="flex-1" />
          <button onClick={onReset} className="text-xs text-slate-400 hover:text-slate-200">
            Ripristina
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3">Campi nativi</p>
          <div className="space-y-1">
            {allColumns.map(col => (
              <label key={col.field} className="flex items-center gap-2 cursor-pointer py-1 text-sm text-slate-300 hover:text-slate-100">
                <input
                  type="checkbox"
                  checked={visibleColumns.has(col.field)}
                  onChange={() => onToggle(col.field)}
                  className="accent-indigo-500"
                />
                {col.label}
              </label>
            ))}
          </div>

          {compatibleVars.length > 0 && (
            <>
              <p className="text-xs text-slate-500 uppercase tracking-wider mt-5 mb-3">Variabili Aggiuntive</p>
              <div className="space-y-1">
                {compatibleVars.map(v => (
                  <label key={v.id} className="flex items-center gap-2 cursor-pointer py-1 text-sm text-slate-300 hover:text-slate-100">
                    <input
                      type="checkbox"
                      checked={visibleVars.has(v.id)}
                      onChange={() => onToggleVar(v.id)}
                      className="accent-indigo-500"
                    />
                    <span>{v.label}</span>
                    <span className="text-xs text-slate-500 ml-auto">{v.tipo}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
