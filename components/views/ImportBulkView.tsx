'use client'
import React, { useState, useEffect } from 'react'
import StepUpload from './import/StepUpload'
import StepEntity, { type EntityTarget } from './import/StepEntity'
import StepMapping, { NATURAL_KEY } from './import/StepMapping'
import StepPreview from './import/StepPreview'
import { api } from '@/lib/api'
import { useHRStore } from '@/store/useHRStore'

type Step = 1 | 2 | 3 | 4

const STEP_LABELS = ['Upload file', 'Entità target', 'Mapping colonne', 'Preview & Conferma']

export default function ImportBulkView() {
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [entity, setEntity] = useState<EntityTarget | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [sheetName, setSheetName] = useState('')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [keyField, setKeyField] = useState<string>('')
  const [dryRunResult, setDryRunResult] = useState<null | { toInsert: number; toUpdate: number; toSkip: number; anomalie: unknown[]; diff: unknown[] }>(null)
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [importDone, setImportDone] = useState<{ inserted: number; updated: number; errors: string[] } | null>(null)
  const { showToast, refreshAll } = useHRStore()

  const loadPreview = async () => {
    if (!file) return
    setDryRunLoading(true)
    try {
      const result = await api.import.dryRun({
        file,
        entity: entity!,
        mode: 'SOSTITUTIVA',
        mapping,
        sheetName,
        keyField: keyField || undefined
      })
      setDryRunResult(result)
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setDryRunLoading(false)
    }
  }

  useEffect(() => {
    if (step === 4) loadPreview()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const handleStep2 = async () => {
    if (!file) return
    try {
      const preview = await api.import.preview(file)
      setHeaders(preview.headers)
      setSheetName(preview.sheetNames[0] ?? '')
      setMapping({})
    } catch (e) {
      showToast(String(e), 'error')
      return
    }
    setStep(3)
  }

  const handleExecute = async () => {
    if (!file || !entity) return
    setExecuting(true)
    try {
      const result = await api.import.execute({ file, entity, mode: 'SOSTITUTIVA', mapping, sheetName, keyField: keyField || undefined })
      setImportDone({ inserted: result.inserted, updated: result.updated, errors: result.errors })
      showToast(`Import completato: ${result.inserted} inseriti, ${result.updated} aggiornati`, 'success')
      await refreshAll()
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setExecuting(false)
    }
  }

  if (importDone) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-4xl">✅</div>
        <h2 className="text-lg font-semibold text-slate-200">Import completato</h2>
        <div className="flex gap-6 text-center">
          <div><div className="text-2xl font-bold text-green-300">{importDone.inserted}</div><div className="text-xs text-slate-500">Inseriti</div></div>
          <div><div className="text-2xl font-bold text-blue-300">{importDone.updated}</div><div className="text-xs text-slate-500">Aggiornati</div></div>
        </div>
        {importDone.errors.length > 0 && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 max-w-md w-full">
            <p className="text-sm font-medium text-red-300 mb-2">{importDone.errors.length} errori</p>
            <div className="text-xs text-red-400 space-y-1">{importDone.errors.map((e, i) => <div key={i}>{e}</div>)}</div>
          </div>
        )}
        <button onClick={() => { setStep(1); setFile(null); setEntity(null); setMapping({}); setImportDone(null) }}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
          Nuovo import
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 bg-slate-900 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-200 mb-3">Caricamento Iniziale</h2>
        <div className="flex gap-2">
          {STEP_LABELS.map((label, i) => {
            const s = (i + 1) as Step
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={[
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                  step === s ? 'bg-indigo-600 text-white' :
                  step > s ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'
                ].join(' ')}>
                  {step > s ? '✓' : s}
                </div>
                <span className={`text-xs ${step === s ? 'text-slate-200' : 'text-slate-500'}`}>{label}</span>
                {i < 3 && <span className="text-slate-700 text-sm">›</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {step === 1 && <StepUpload file={file} onFileSelect={setFile} onNext={() => setStep(2)} />}
        {step === 2 && <StepEntity entity={entity} onSelect={setEntity} onNext={handleStep2} onBack={() => setStep(1)} />}
        {step === 3 && <StepMapping headers={headers} entity={entity!} mapping={mapping} keyField={keyField || NATURAL_KEY[entity!]} onMappingChange={setMapping} onKeyFieldChange={k => { setKeyField(k); setMapping({}) }} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4 && <StepPreview result={dryRunResult} loading={dryRunLoading} onRefresh={loadPreview} onExecute={handleExecute} onBack={() => setStep(3)} executing={executing} />}
      </div>
    </div>
  )
}
