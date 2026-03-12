'use client'
import React from 'react'
import { CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'

interface DryRunResult {
  toInsert: number
  toUpdate: number
  toSkip: number
  toVarUpdate: number
  anomalie: unknown[]
  diff: unknown[]
}

interface StepPreviewProps {
  result: DryRunResult | null
  loading: boolean
  onRefresh: () => void
  onExecute: () => void
  onBack: () => void
  executing: boolean
}

export default function StepPreview({ result, loading, onRefresh, onExecute, onBack, executing }: StepPreviewProps) {
  return (
    <div className="flex flex-col gap-6 py-8 px-6 max-w-lg mx-auto w-full">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-medium text-slate-300 flex-1">Anteprima (dry-run)</h3>
        <button onClick={onRefresh} disabled={loading}
          className="text-slate-400 hover:text-slate-200 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-10 text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Analisi in corso...
        </div>
      )}

      {result && !loading && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-300">{result.toInsert}</div>
              <div className="text-xs text-green-500 mt-1">Da inserire</div>
            </div>
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-300">{result.toUpdate}</div>
              <div className="text-xs text-blue-500 mt-1">Campi nativi da aggiornare</div>
            </div>
            {result.toVarUpdate > 0 && (
              <div className="bg-indigo-900/20 border border-indigo-700 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-indigo-300">{result.toVarUpdate}</div>
                <div className="text-xs text-indigo-400 mt-1">Variabili integrative da salvare</div>
              </div>
            )}
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-slate-400">{result.toSkip}</div>
              <div className="text-xs text-slate-500 mt-1">Invariati</div>
            </div>
          </div>

          {result.anomalie.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-300">{result.anomalie.length} anomalie rilevate</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {(result.anomalie as Array<{ tipo: string; dettaglio: string; riga?: number }>).map((a, i) => (
                  <div key={i} className="text-xs text-amber-400">
                    {a.riga && <span className="font-mono mr-1">R{a.riga}</span>}
                    <span className="font-medium">{a.tipo}</span>: {a.dettaglio}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.toInsert === 0 && result.toUpdate === 0 && result.toVarUpdate === 0 && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Nessuna modifica da applicare
            </div>
          )}
        </>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          ← Indietro
        </button>
        <button
          onClick={onExecute}
          disabled={executing || loading || !result || (result.toInsert === 0 && result.toUpdate === 0 && result.toVarUpdate === 0)}
          className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors font-medium"
        >
          {executing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {executing ? 'Import in corso…' : 'Conferma ed esegui'}
        </button>
      </div>
    </div>
  )
}
