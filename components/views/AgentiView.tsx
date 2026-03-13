'use client'
import React, { useCallback, useRef, useState } from 'react'
import { Upload, FileText, MessageSquare, Loader2, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '@/lib/api'
import { useHRStore } from '@/store/useHRStore'
import type { OrdineServizioAnalysis, OrdineServizioProposal, ProposalTipo } from '@/types'

type Mode = 'documento' | 'prompt'
type Phase = 'input' | 'loading' | 'proposte' | 'done'

const TIPO_COLORS: Record<ProposalTipo, string> = {
  INSERT_PERSONA:      'bg-emerald-700/30 text-emerald-300 border-emerald-700',
  UPDATE_PERSONA:      'bg-blue-700/30 text-blue-300 border-blue-700',
  DELETE_PERSONA:      'bg-red-700/30 text-red-300 border-red-700',
  INSERT_NODO:         'bg-emerald-700/30 text-emerald-300 border-emerald-700',
  UPDATE_NODO:         'bg-blue-700/30 text-blue-300 border-blue-700',
  REPARENT_NODO:       'bg-amber-700/30 text-amber-300 border-amber-700',
  UPDATE_RUOLO_TNS:    'bg-violet-700/30 text-violet-300 border-violet-700',
  INSERT_STRUTTURA_TNS:'bg-violet-700/30 text-violet-300 border-violet-700',
  UPDATE_STRUTTURA_TNS:'bg-violet-700/30 text-violet-300 border-violet-700',
}

const CONFIDENCE_DOT: Record<string, string> = {
  high:   'bg-emerald-400',
  medium: 'bg-amber-400',
  low:    'bg-red-400',
}

function confidenceLabel(c: string) {
  return c === 'high' ? 'Alta' : c === 'medium' ? 'Media' : 'Bassa'
}

const ACCEPTED_EXTS = '.pdf,.docx,.doc,.xls,.xlsx,.csv,.md,.txt'

function ProposalRow({ p, checked, onToggle }: { p: OrdineServizioProposal; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`border rounded-lg p-3 transition-colors ${checked ? 'border-slate-600 bg-slate-800/50' : 'border-slate-700/50 bg-slate-900/30 opacity-60'}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 accent-indigo-500 w-4 h-4 cursor-pointer flex-none"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded border font-mono ${TIPO_COLORS[p.tipo]}`}>{p.tipo}</span>
            {p.entityLabel && <span className="text-xs text-slate-400">{p.entityLabel}</span>}
            {p.entityId && <span className="text-xs text-slate-500 font-mono">{p.entityId}</span>}
            <span className="flex items-center gap-1 text-xs text-slate-500 ml-auto">
              <span className={`w-2 h-2 rounded-full ${CONFIDENCE_DOT[p.confidence]}`} />
              {confidenceLabel(p.confidence)}
            </span>
          </div>
          <p className="text-sm text-slate-200">{p.label}</p>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mt-1 transition-colors"
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Motivazione
          </button>
          {open && (
            <p className="text-xs text-slate-400 mt-1 pl-4 border-l border-slate-700">{p.rationale}</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AgentiView() {
  const { showToast, refreshAll } = useHRStore()

  const [phase, setPhase] = useState<Phase>('input')
  const [mode, setMode] = useState<Mode>('documento')
  const [file, setFile] = useState<File | null>(null)
  const [promptText, setPromptText] = useState('')
  const [dragging, setDragging] = useState(false)
  const [analysis, setAnalysis] = useState<OrdineServizioAnalysis | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState<{ applied: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canAnalyze = mode === 'documento' ? !!file : promptText.trim().length > 0

  const handleFileSelect = (f: File) => setFile(f)

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelect(f)
  }, [])

  const analyze = async () => {
    setPhase('loading')
    try {
      const result = await api.agents.analyzeOrdineServizio({
        file: mode === 'documento' ? file ?? undefined : undefined,
        prompt: mode === 'prompt' ? promptText : undefined,
      })
      setAnalysis(result)
      setSelected(new Set(result.proposte.map(p => p.id)))
      setPhase('proposte')
    } catch (err) {
      setPhase('input')
      showToast(`Errore analisi: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  const apply = async () => {
    if (!analysis) return
    const toApply = analysis.proposte.filter(p => selected.has(p.id))
    setApplying(true)
    try {
      const res = await api.agents.executeOrdineServizio(toApply)
      setResult(res)
      setPhase('done')
      await refreshAll()
      if (res.errors.length === 0) {
        showToast(`${res.applied} proposte applicate con successo`, 'success')
      } else {
        showToast(`${res.applied} applicate, ${res.errors.length} errori`, 'error')
      }
    } catch (err) {
      showToast(`Errore esecuzione: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setApplying(false)
    }
  }

  const reset = () => {
    setPhase('input')
    setFile(null)
    setPromptText('')
    setAnalysis(null)
    setSelected(new Set())
    setResult(null)
  }

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-400" />
        <p className="text-sm">Analisi AI in corso…</p>
      </div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
        <div className="text-center">
          <p className="text-lg font-semibold text-slate-200">{result.applied} proposte applicate</p>
          {result.errors.length > 0 && (
            <div className="mt-3 text-left max-w-lg">
              <p className="text-sm text-red-400 mb-1">{result.errors.length} errori:</p>
              <ul className="text-xs text-red-300 space-y-0.5">
                {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
              </ul>
            </div>
          )}
        </div>
        <button
          onClick={reset}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          Nuovo documento
        </button>
      </div>
    )
  }

  if (phase === 'proposte' && analysis) {
    const selectedCount = selected.size
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-none p-4 border-b border-slate-700 space-y-3">
          <div className="bg-indigo-900/30 border border-indigo-700/40 rounded-lg p-3">
            <p className="text-sm text-indigo-200">{analysis.sommario}</p>
          </div>
          {analysis.avvertenze.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-none" />
                <span className="text-xs font-medium text-amber-300">Avvertenze</span>
              </div>
              <ul className="text-xs text-amber-200 space-y-0.5">
                {analysis.avvertenze.map((a, i) => <li key={i}>• {a}</li>)}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{analysis.proposte.length} proposte totali</span>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set(analysis.proposte.map(p => p.id)))} className="text-indigo-400 hover:text-indigo-300">Seleziona tutti</button>
              <span>·</span>
              <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-slate-300">Deseleziona tutti</button>
            </div>
            <span>{selectedCount} selezionate</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {analysis.proposte.map(p => (
            <ProposalRow
              key={p.id}
              p={p}
              checked={selected.has(p.id)}
              onToggle={() => setSelected(prev => {
                const next = new Set(prev)
                if (next.has(p.id)) next.delete(p.id)
                else next.add(p.id)
                return next
              })}
            />
          ))}
        </div>

        <div className="flex-none p-4 border-t border-slate-700 flex items-center justify-between gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            ← Nuovo documento
          </button>
          <button
            onClick={apply}
            disabled={selectedCount === 0 || applying}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-2"
          >
            {applying && <Loader2 className="w-4 h-4 animate-spin" />}
            Applica {selectedCount} proposte selezionate
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6">
      <div className="max-w-2xl w-full mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-slate-200">Ordine di Servizio AI</h1>
          <p className="text-sm text-slate-500 mt-1">Carica un documento o inserisci un prompt per generare proposte di modifica al DB.</p>
        </div>

        <div className="flex border-b border-slate-700">
          {(['documento', 'prompt'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                'flex items-center gap-2 px-4 py-2 text-sm border-b-2 transition-colors capitalize',
                mode === m
                  ? 'border-indigo-500 text-indigo-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              ].join(' ')}
            >
              {m === 'documento' ? <FileText className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              {m === 'documento' ? 'Documento' : 'Prompt testuale'}
            </button>
          ))}
        </div>

        {mode === 'documento' ? (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={[
              'border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors',
              dragging ? 'border-indigo-500 bg-indigo-900/10' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/30'
            ].join(' ')}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTS}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
            />
            <Upload className="w-8 h-8 text-slate-500" />
            {file ? (
              <div className="text-center">
                <p className="text-sm font-medium text-slate-200">{file.name}</p>
                <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm text-slate-400">Trascina qui il documento o clicca per selezionarlo</p>
                <p className="text-xs text-slate-600 mt-1">PDF, .docx, .doc, .xls, .xlsx, .csv, .md</p>
                <p className="text-xs text-slate-600">Ordini di servizio, circolari HR, delibere organizzative, liste cessati</p>
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            placeholder="Descrivi la modifica organizzativa (es. 'Mario Rossi CF RSSMRO... viene assunto il 1/4/2026 nell'UO Direzione Generale come Senior Editor')"
            rows={6}
            className="w-full bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 resize-y focus:outline-none focus:border-indigo-500 transition-colors"
          />
        )}

        <div className="flex justify-end">
          <button
            onClick={analyze}
            disabled={!canAnalyze}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors"
          >
            Analizza
          </button>
        </div>
      </div>
    </div>
  )
}
