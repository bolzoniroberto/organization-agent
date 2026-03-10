'use client'
import React from 'react'
import { useHRStore } from '@/store/useHRStore'

export type EntityTarget = 'nodi_org' | 'persone' | 'timesheet' | 'tns' | 'strutture_tns'

interface StepEntityProps {
  entity: EntityTarget | null
  onSelect: (e: EntityTarget) => void
  onNext: () => void
  onBack: () => void
}

const ENTITIES: {
  id: EntityTarget
  label: string
  keyLabel: string
  desc: string
  countKey: 'nodi' | 'persone' | 'timesheet' | 'tns' | 'struttureTns'
}[] = [
  {
    id: 'nodi_org',
    label: 'Posizioni organizzative',
    keyLabel: 'Chiave: ID posizione',
    desc: 'Strutture gerarchiche e posizioni dell\'organigramma. Usato per caricare il file posizioni.',
    countKey: 'nodi',
  },
  {
    id: 'persone',
    label: 'Anagrafica persone',
    keyLabel: 'Chiave: Codice Fiscale (CF)',
    desc: 'Dati anagrafici e contrattuali dei dipendenti. Usato per caricare file payroll e retribuzioni.',
    countKey: 'persone',
  },
  {
    id: 'tns',
    label: 'TNS dipendenti',
    keyLabel: 'Chiave: Codice Fiscale (CF)',
    desc: 'Ruoli e permessi TNS per ciascun dipendente. Strutturato per CF come ID univoco.',
    countKey: 'tns',
  },
  {
    id: 'strutture_tns',
    label: 'TNS strutture',
    keyLabel: 'Chiave: Codice struttura',
    desc: 'Strutture organizzative TNS con codice proprio, distinte dai dipendenti.',
    countKey: 'struttureTns',
  },
  {
    id: 'timesheet',
    label: 'Supervisioni Timesheet',
    keyLabel: 'Chiave: CF dipendente',
    desc: 'Relazioni supervisore/dipendente per approvazione timesheet.',
    countKey: 'timesheet',
  },
]

export default function StepEntity({ entity, onSelect, onNext, onBack }: StepEntityProps) {
  const { counts } = useHRStore()

  return (
    <div className="flex flex-col items-center gap-6 py-8 px-6 max-w-lg mx-auto">
      <div className="w-full">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Seleziona il tipo di dati da importare</h3>
        <div className="space-y-2">
          {ENTITIES.map(e => (
            <button key={e.id} onClick={() => onSelect(e.id)}
              className={[
                'w-full text-left px-4 py-3 rounded-lg border transition-colors',
                entity === e.id
                  ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300'
                  : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500'
              ].join(' ')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{e.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                    entity === e.id ? 'bg-indigo-800/50 text-indigo-300' : 'bg-slate-700 text-slate-400'
                  }`}>{e.keyLabel}</span>
                </div>
                {counts && (
                  <span className="text-xs text-slate-500 font-mono flex-shrink-0 ml-2">
                    {counts[e.countKey] ?? 0} record
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">{e.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          ← Indietro
        </button>
        <button onClick={onNext} disabled={!entity}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium">
          Avanti →
        </button>
      </div>
    </div>
  )
}
