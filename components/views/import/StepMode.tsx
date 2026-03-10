'use client'
import React from 'react'

export type ImportMode = 'SOSTITUTIVA' | 'INTEGRATIVA'

interface StepModeProps {
  mode: ImportMode | null
  onSelect: (m: ImportMode) => void
  onNext: () => void
  onBack: () => void
}

const MODES = [
  {
    id: 'SOSTITUTIVA' as const,
    label: 'Sostitutiva',
    desc: 'Sovrascrive tutti i campi mappati (INSERT OR REPLACE). Usa per il caricamento completo.',
    color: 'border-amber-600 bg-amber-900/20 text-amber-300'
  },
  {
    id: 'INTEGRATIVA' as const,
    label: 'Integrativa',
    desc: 'Scrive solo se il campo attuale è NULL o vuoto. Non sovrascrive dati esistenti.',
    color: 'border-blue-600 bg-blue-900/20 text-blue-300'
  },
]

export default function StepMode({ mode, onSelect, onNext, onBack }: StepModeProps) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 px-6 max-w-lg mx-auto">
      <div className="w-full">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Modalità di arricchimento</h3>
        <div className="space-y-3">
          {MODES.map(m => (
            <button key={m.id} onClick={() => onSelect(m.id)}
              className={[
                'w-full text-left px-4 py-4 rounded-lg border-2 transition-colors',
                mode === m.id ? m.color : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'
              ].join(' ')}>
              <p className="text-sm font-semibold">{m.label}</p>
              <p className="text-xs mt-1 opacity-75">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          ← Indietro
        </button>
        <button onClick={onNext} disabled={!mode}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium">
          Avanti →
        </button>
      </div>
    </div>
  )
}
