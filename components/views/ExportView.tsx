'use client'
import React, { useState } from 'react'
import { Download, ShieldCheck, AlertTriangle, XCircle, RefreshCw, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'

type IssueRow = Record<string, unknown>
type ValidationResult = { errors: IssueRow[]; warnings: IssueRow[] }

function IssueList({ issues, severity }: { issues: IssueRow[]; severity: 'error' | 'warning' }) {
  if (issues.length === 0) return null
  const isErr = severity === 'error'
  return (
    <div className="mt-2">
      <div className={`text-xs font-semibold mb-1 ${isErr ? 'text-red-400' : 'text-amber-400'}`}>
        {isErr ? 'Errori' : 'Avvisi'} ({issues.length})
      </div>
      <div className="space-y-0.5 max-h-48 overflow-y-auto">
        {issues.map((issue, i) => (
          <div key={i} className={`flex items-start gap-2 px-2 py-1 rounded text-xs ${isErr ? 'bg-red-950/40' : 'bg-amber-950/40'}`}>
            <span className={`font-mono shrink-0 ${isErr ? 'text-red-400' : 'text-amber-400'}`}>
              {String(issue.nodoId ?? issue.codice ?? '—')}
            </span>
            <span className="text-slate-400 shrink-0">{String(issue.tipo ?? '')}</span>
            <span className="text-slate-300 flex-1 truncate" title={String(issue.label ?? '')}>{String(issue.label ?? '')}</span>
            <span className={`shrink-0 font-medium ${isErr ? 'text-red-300' : 'text-amber-300'}`}>{String(issue.field ?? '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExportCard({
  title,
  subtitle,
  description,
  onValidate,
  onDownload,
}: {
  title: string
  subtitle: string
  description: string
  onValidate: () => Promise<ValidationResult>
  onDownload: () => Promise<void>
}) {
  const [validating, setValidating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [validateError, setValidateError] = useState<string | null>(null)

  const handleValidate = async () => {
    setValidating(true)
    setValidateError(null)
    try {
      const r = await onValidate()
      setResult(r)
    } catch (e) {
      setValidateError(String(e))
    } finally {
      setValidating(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await onDownload()
    } finally {
      setDownloading(false)
    }
  }

  const hasErrors = result && result.errors.length > 0
  const BLOCKING_FIELDS = ['ID (mancante)', 'ID (duplicato)', 'Ciclo gerarchia']
  const hasBlockingErrors = result && result.errors.some(
    (e: IssueRow) => {
      const f = String(e.field ?? '')
      return BLOCKING_FIELDS.includes(f) || f.includes('non esiste')
    }
  )

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex flex-col gap-3">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleValidate}
              disabled={validating}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-slate-100 transition-colors disabled:opacity-40"
            >
              {validating
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <ShieldCheck className="w-3 h-3" />}
              Valida
            </button>
            <button
              onClick={handleDownload}
              disabled={downloading || !!hasBlockingErrors}
              title={hasBlockingErrors ? 'Correggi gli errori bloccanti prima di scaricare' : undefined}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-indigo-700 bg-indigo-900/30 text-indigo-300 hover:border-indigo-500 hover:text-indigo-100 transition-colors disabled:opacity-40"
            >
              {downloading
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <Download className="w-3 h-3" />}
              Scarica
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-600 mt-2">{description}</p>
      </div>

      {validateError && (
        <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">
          {validateError}
        </div>
      )}

      {result && (
        <div>
          <div className="flex items-center gap-3">
            {result.errors.length === 0 && result.warnings.length === 0 ? (
              <div className="flex items-center gap-1.5 text-xs text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                Nessun problema rilevato — pronto per il download
              </div>
            ) : (
              <>
                {result.errors.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-red-400">
                    <XCircle className="w-3.5 h-3.5" />
                    {result.errors.length} {result.errors.length === 1 ? 'errore' : 'errori'}
                  </div>
                )}
                {result.warnings.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {result.warnings.length} {result.warnings.length === 1 ? 'avviso' : 'avvisi'}
                  </div>
                )}
              </>
            )}
          </div>
          {hasBlockingErrors && (
            <p className="text-xs text-red-400/70 mt-1">
              Download bloccato — correggi ID duplicati, cicli nella gerarchia o ReportsTo non validi prima di esportare.
            </p>
          )}
          {hasErrors && !hasBlockingErrors && (
            <p className="text-xs text-red-400/70 mt-1">
              Il file può essere scaricato, ma i campi indicati saranno vuoti nel template.
            </p>
          )}
          <IssueList issues={result.errors} severity="error" />
          <IssueList issues={result.warnings} severity="warning" />
        </div>
      )}
    </div>
  )
}

export default function ExportView() {
  return (
    <div className="flex flex-col h-full bg-slate-950">
      <div className="flex-none px-4 py-3 border-b border-slate-700 bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-200">Esportazioni</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Genera i file Excel nei formati richiesti dai sistemi esterni. Valida prima del download per verificare la completezza dei dati.
        </p>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        <ExportCard
          title="ORG PLUS — Organigramma"
          subtitle="Gruppo Il Sole 24 ORE Per ORG PLUS.xlsx · foglio DB_ORGPLUS"
          description="Esporta tutti i nodi organigramma (STRUTTURA e PERSONA) con i 123 campi del template. Errori: campi obbligatori mancanti su nodi PERSONA (SocietàOrg, UO, CF, Cognome, Nome, Società, Area, SottoArea, CdcAmm., Contratto, Qualifica, Livello, Data-ass, Sesso, email, Fte, Sede). Avvisi: RAL e Job-title mancanti."
          onValidate={() => api.export.orgPlus.validate()}
          onDownload={() => api.export.orgPlus.download()}
        />

        <ExportCard
          title="TNS ORG PLUS"
          subtitle="TNS24 Gruppo Il Sole 24 ORE ORG PLUS.xls · foglio DB_TNS"
          description="Esporta strutture TNS e ruoli TNS delle persone nei 26 campi del template (fogli: DB_TNS, TNS Personale, TNS Strutture). Errori: Codice TNS mancante, PADRE mancante per strutture, campi obbligatori mancanti su persone con ruolo TNS (padre_tns, titolare_tns, viaggiatore, controllore_asst, sede_tns, gruppo_sind)."
          onValidate={() => api.export.tnsOrg.validate()}
          onDownload={() => api.export.tnsOrg.download()}
        />
      </div>
    </div>
  )
}
