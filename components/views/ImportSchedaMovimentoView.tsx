'use client'
import React, { useState, useCallback, useMemo } from 'react'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import type { SchedaMovimentoParsed } from '@/types'

type Step = 1 | 2 | 3 | 4

interface ParseResult {
  parsed: SchedaMovimentoParsed
  cfExists: boolean
  cfDeleted: boolean
}

// Campi editabili nel wizard, inizializzati da parsed + vuoti per i campi mancanti
interface FormState {
  // Da Excel
  tipoMovimento: string
  decorrenza: string
  cf: string
  cognome: string
  nome: string
  sesso: string
  data_nascita: string
  societa: string
  area: string
  sotto_area: string
  cdc_amministrativo: string
  sede: string
  tipo_contratto: string
  qualifica: string
  email: string
  matricola: string
  data_fine_rapporto: string
  job_title: string
  referente_diretto: string
  // Da completare
  livello: string
  ral: string
  part_time: string
  // Supervisore
  cf_supervisore: string
}

const TIPO_MOVIMENTO_OPTS = [
  'INGRESSO', 'INGRESSO CON DISTACCO', 'USCITA', 'TRASFERIMENTO',
  'CAMBIO CONTRATTO', 'TRASFORMAZIONE CONTRATTO', 'PROROGA', 'PROROGA DISTACCO',
  'DISTACCO', 'DISTACCO - FINE',
]

const QUALIFICA_OPTS = [
  'DIRIGENTE', 'QUADRO', 'IMPIEGATO', 'GIORNALISTA', 'OPERAIO',
  'PRATICANTE', 'Stage', 'Co.Co.Co.', 'Co.Co.Pro.', 'Part. Iva', 'Contr. Somm.ne',
]

const SESSO_OPTS = [{ v: 'M', l: 'Maschile' }, { v: 'F', l: 'Femminile' }]

// Campi che vengono dall'Excel (per il badge visivo)
const EXCEL_FIELDS = new Set([
  'tipoMovimento','decorrenza','cf','cognome','nome','sesso','data_nascita',
  'societa','area','sotto_area','cdc_amministrativo','sede','tipo_contratto',
  'qualifica','email','matricola','data_fine_rapporto','job_title','referente_diretto',
])

function initForm(parsed: SchedaMovimentoParsed): FormState {
  return {
    tipoMovimento:      parsed.tipoMovimento ?? 'INGRESSO',
    decorrenza:         parsed.decorrenza ?? '',
    cf:                 parsed.cf ?? '',
    cognome:            parsed.cognome ?? '',
    nome:               parsed.nome ?? '',
    sesso:              parsed.sesso ?? '',
    data_nascita:       parsed.data_nascita ?? '',
    societa:            parsed.societa ?? '',
    area:               parsed.area ?? '',
    sotto_area:         parsed.sotto_area ?? '',
    cdc_amministrativo: parsed.cdc_amministrativo ?? '',
    sede:               parsed.sede ?? '',
    tipo_contratto:     parsed.tipo_contratto ?? '',
    qualifica:          parsed.qualifica ?? '',
    email:              parsed.email ?? '',
    matricola:          parsed.matricola ?? '',
    data_fine_rapporto: parsed.data_fine_rapporto ?? '',
    job_title:          parsed.job_title ?? '',
    referente_diretto:  parsed.referente_diretto ?? '',
    // da completare
    livello:            '',
    ral:                '',
    part_time:          '100',
    // supervisore
    cf_supervisore:     '',
  }
}

function validateForm(form: FormState): string[] {
  const errors: string[] = []
  if (!form.cf) errors.push('Codice fiscale obbligatorio')
  else if (!/^[A-Z0-9]{16}$/i.test(form.cf)) errors.push('Codice fiscale non valido (16 caratteri alfanumerici)')
  if (!form.cognome) errors.push('Cognome obbligatorio')
  if (!form.nome) errors.push('Nome obbligatorio')
  if (!form.decorrenza) errors.push('Decorrenza obbligatoria')
  const isIngresso = form.tipoMovimento.startsWith('INGRESSO')
  if (isIngresso && !form.livello) errors.push('Livello obbligatorio per ingresso')
  const ral = form.ral !== '' ? Number(form.ral) : null
  if (ral !== null && (isNaN(ral) || ral < 0)) errors.push('RAL non valido')
  const pt = Number(form.part_time)
  if (isNaN(pt) || pt < 0 || pt > 100) errors.push('Part-time deve essere tra 0 e 100')
  return errors
}

// Cerca supervisore nei persone dello store basandosi sul nome libero
function findSupervisorCandidates(
  name: string,
  persone: { cf: string; cognome: string | null; nome: string | null }[]
) {
  if (!name) return []
  const parts = name.trim().toLowerCase().split(/\s+/)
  return persone.filter(p =>
    parts.some(pt =>
      p.cognome?.toLowerCase().includes(pt) || p.nome?.toLowerCase().includes(pt)
    )
  ).slice(0, 6)
}

// Piccolo componente campo con badge source
function Field({
  label,
  children,
  fromExcel,
  required,
}: {
  label: string
  children: React.ReactNode
  fromExcel?: boolean
  required?: boolean
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="text-xs text-slate-400">{label}</label>
        {required && <span className="text-[10px] text-amber-400 font-medium">richiesto</span>}
        {fromExcel && <span className="text-[10px] text-indigo-400">da Excel</span>}
      </div>
      {children}
    </div>
  )
}

const inputCls = (fromExcel?: boolean) =>
  `w-full px-2.5 py-1.5 text-sm rounded-md border outline-none transition-colors bg-slate-900 text-slate-100 ${
    fromExcel
      ? 'border-indigo-700/60 focus:border-indigo-500'
      : 'border-slate-600 focus:border-indigo-500'
  }`

export default function ImportSchedaMovimentoView() {
  const { persone, showToast, refreshAll } = useHRStore()
  const [step, setStep] = useState<Step>(1)
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [executeResult, setExecuteResult] = useState<{ success: boolean; actions: string[]; error?: string } | null>(null)

  const activePersone = useMemo(() => persone.filter(p => !p.deleted_at), [persone])

  const supervisorCandidates = useMemo(() => {
    if (!form?.referente_diretto) return []
    return findSupervisorCandidates(form.referente_diretto, activePersone)
  }, [form?.referente_diretto, activePersone])

  const set = (key: keyof FormState, value: string) =>
    setForm(prev => prev ? { ...prev, [key]: value } : prev)

  const isIngresso = form?.tipoMovimento.startsWith('INGRESSO')
  const isUscita = form?.tipoMovimento === 'USCITA'

  const parseFile = async (file: File) => {
    setLoading(true)
    try {
      const result = await api.import.schedaMovimento.parse(file) as ParseResult
      setParseResult(result)
      setForm(initForm(result.parsed as SchedaMovimentoParsed))
      setStep(2)
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) parseFile(file)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
  }

  const goToPreview = () => {
    if (!form) return
    const errs = validateForm(form)
    setErrors(errs)
    if (errs.length === 0) setStep(3)
  }

  const execute = async () => {
    if (!form) return
    setLoading(true)
    try {
      const body = {
        tipoMovimento: form.tipoMovimento,
        decorrenza: form.decorrenza,
        persona: {
          cf: form.cf.toUpperCase(),
          cognome: form.cognome,
          nome: form.nome,
          sesso: form.sesso || null,
          data_nascita: form.data_nascita || null,
          societa: form.societa || null,
          area: form.area || null,
          sotto_area: form.sotto_area || null,
          cdc_amministrativo: form.cdc_amministrativo || null,
          sede: form.sede || null,
          tipo_contratto: form.tipo_contratto || null,
          qualifica: form.qualifica || null,
          livello: form.livello || null,
          email: form.email || null,
          ral: form.ral !== '' ? Number(form.ral) : null,
          part_time: Number(form.part_time) || 100,
          data_assunzione: isIngresso ? form.decorrenza : null,
          data_fine_rapporto: form.data_fine_rapporto || null,
          matricola: form.matricola || null,
          extra_data: {},
        },
        supervisione: (isIngresso && (form.cf_supervisore || form.referente_diretto)) ? {
          cf_supervisore: form.cf_supervisore || null,
        } : null,
      }

      const result = await api.import.schedaMovimento.execute(body)
      setExecuteResult(result)
      setStep(4)
      if (result.success) {
        showToast('Scheda importata con successo')
        refreshAll()
      }
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setStep(1)
    setParseResult(null)
    setForm(null)
    setErrors([])
    setExecuteResult(null)
  }

  // ─── STEP LABELS ─────────────────────────────────────────────────────────────
  const STEP_LABELS = ['Upload', 'Revisione & Completamento', 'Anteprima', 'Conferma']

  return (
    <div className="flex flex-col h-full overflow-auto bg-slate-950 p-4">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step
          const active = step === n
          const done = step > n
          return (
            <React.Fragment key={n}>
              {i > 0 && <div className={`flex-1 h-px ${done ? 'bg-indigo-600' : 'bg-slate-700'}`} />}
              <div className="flex items-center gap-1.5 shrink-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium ${
                  active ? 'bg-indigo-600 text-white' : done ? 'bg-indigo-800 text-indigo-300' : 'bg-slate-700 text-slate-400'
                }`}>{done ? '✓' : n}</div>
                <span className={`text-xs ${active ? 'text-slate-100' : 'text-slate-500'}`}>{label}</span>
              </div>
            </React.Fragment>
          )
        })}
      </div>

      {/* ─── STEP 1: UPLOAD ──────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 transition-colors cursor-pointer ${
              dragging ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-700 hover:border-slate-500'
            }`}
            onClick={() => document.getElementById('scheda-file-input')?.click()}
          >
            <div className="text-4xl">📋</div>
            <p className="text-slate-300 text-sm font-medium">Trascina qui la Scheda Movimenti</p>
            <p className="text-slate-500 text-xs">oppure clicca per selezionare il file .xlsx</p>
            {loading && <p className="text-indigo-400 text-xs">Analisi in corso...</p>}
          </div>
          <input id="scheda-file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
          <p className="text-slate-600 text-xs text-center max-w-md">
            Formato atteso: <span className="font-mono">_Modello Scheda Movimenti_*.xlsx</span> — foglio "Scheda Movimento"
            con layout verticale (una riga per campo).
          </p>
        </div>
      )}

      {/* ─── STEP 2: REVISIONE & COMPLETAMENTO ───────────────────────────────── */}
      {step === 2 && form && parseResult && (
        <div className="flex flex-col gap-5 max-w-4xl">
          {/* CF warnings */}
          {parseResult.cfExists && !parseResult.cfDeleted && (
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg px-4 py-2.5 text-sm text-amber-300">
              ⚠ CF <span className="font-mono">{form.cf}</span> già presente tra le persone attive.{' '}
              {isIngresso ? 'Procedendo, la persona verrà aggiornata (non duplicata).' : ''}
            </div>
          )}
          {parseResult.cfExists && parseResult.cfDeleted && (
            <div className="bg-amber-900/30 border border-amber-700 rounded-lg px-4 py-2.5 text-sm text-amber-300">
              ⚠ CF <span className="font-mono">{form.cf}</span> trovato tra i record eliminati.
              Procedendo, la persona verrà ripristinata e aggiornata.
            </div>
          )}
          {isUscita && !parseResult.cfExists && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2.5 text-sm text-red-300">
              ✕ CF <span className="font-mono">{form.cf}</span> non trovato tra le persone attive.
              Verifica il codice fiscale prima di procedere.
            </div>
          )}

          {/* Tipo movimento */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Tipo di movimento</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tipo movimento" fromExcel>
                <select value={form.tipoMovimento} onChange={e => set('tipoMovimento', e.target.value)} className={inputCls(true)}>
                  {TIPO_MOVIMENTO_OPTS.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Decorrenza" fromExcel required>
                <input type="date" value={form.decorrenza} onChange={e => set('decorrenza', e.target.value)} className={inputCls(true)} />
              </Field>
            </div>
          </div>

          {/* Anagrafica */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Anagrafica</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Codice Fiscale" fromExcel required>
                <input value={form.cf} onChange={e => set('cf', e.target.value.toUpperCase())} className={inputCls(true)} />
              </Field>
              <Field label="Sesso" fromExcel>
                <select value={form.sesso} onChange={e => set('sesso', e.target.value)} className={inputCls(true)}>
                  <option value="">—</option>
                  {SESSO_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </Field>
              <Field label="Cognome" fromExcel required>
                <input value={form.cognome} onChange={e => set('cognome', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Nome" fromExcel required>
                <input value={form.nome} onChange={e => set('nome', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Data di nascita" fromExcel>
                <input type="date" value={form.data_nascita} onChange={e => set('data_nascita', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Email" fromExcel>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Matricola / Codice Oneservice" fromExcel={!!parseResult.parsed.matricola}>
                <input value={form.matricola} onChange={e => set('matricola', e.target.value)} className={inputCls(!!parseResult.parsed.matricola)} />
              </Field>
              {isUscita && (
                <Field label="Data fine rapporto" fromExcel>
                  <input type="date" value={form.data_fine_rapporto} onChange={e => set('data_fine_rapporto', e.target.value)} className={inputCls(true)} />
                </Field>
              )}
            </div>
          </div>

          {/* Dati lavorativi */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Dati lavorativi</h3>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Società" fromExcel>
                <input value={form.societa} onChange={e => set('societa', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Area" fromExcel>
                <input value={form.area} onChange={e => set('area', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Sotto Area" fromExcel>
                <input value={form.sotto_area} onChange={e => set('sotto_area', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="CDC Amministrativo" fromExcel>
                <input value={form.cdc_amministrativo} onChange={e => set('cdc_amministrativo', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Sede" fromExcel>
                <input value={form.sede} onChange={e => set('sede', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Tipo Contratto" fromExcel>
                <input value={form.tipo_contratto} onChange={e => set('tipo_contratto', e.target.value)} className={inputCls(true)} />
              </Field>
              <Field label="Qualifica" fromExcel>
                <select value={form.qualifica} onChange={e => set('qualifica', e.target.value)} className={inputCls(!!parseResult.parsed.qualifica)}>
                  <option value="">—</option>
                  {QUALIFICA_OPTS.map(q => <option key={q}>{q}</option>)}
                </select>
              </Field>
              <Field label="Livello" required={isIngresso}>
                <input
                  value={form.livello}
                  onChange={e => set('livello', e.target.value)}
                  placeholder="es. Q1, I3, D..."
                  className={`${inputCls(false)} ${!form.livello && isIngresso ? 'border-amber-600' : ''}`}
                />
              </Field>
              <Field label="RAL (€)">
                <input
                  type="number" min="0" value={form.ral}
                  onChange={e => set('ral', e.target.value)}
                  placeholder="es. 45000"
                  className={inputCls(false)}
                />
              </Field>
              <Field label="Part-time (%)">
                <input
                  type="number" min="0" max="100" value={form.part_time}
                  onChange={e => set('part_time', e.target.value)}
                  className={inputCls(false)}
                />
              </Field>
            </div>
          </div>

          {/* Supervisore — solo INGRESSO */}
          {isIngresso && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Supervisore Timesheet</h3>
              {form.referente_diretto && (
                <p className="text-xs text-slate-500 mb-3">
                  Referente dall&apos;Excel: <span className="text-slate-300">{form.referente_diretto}</span>
                  {supervisorCandidates.length > 0 && ' — seleziona il CF corrispondente:'}
                </p>
              )}
              {supervisorCandidates.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {supervisorCandidates.map(p => (
                    <button
                      key={p.cf}
                      onClick={() => set('cf_supervisore', form.cf_supervisore === p.cf ? '' : p.cf)}
                      className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                        form.cf_supervisore === p.cf
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {p.cognome} {p.nome} <span className="font-mono text-[10px] opacity-70">{p.cf}</span>
                    </button>
                  ))}
                </div>
              )}
              <Field label="CF Supervisore">
                <input
                  value={form.cf_supervisore}
                  onChange={e => set('cf_supervisore', e.target.value.toUpperCase())}
                  placeholder="Codice fiscale supervisore (opzionale)"
                  className={inputCls(false)}
                />
              </Field>
            </div>
          )}

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-red-400 mb-1">Errori da correggere:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {errors.map(e => <li key={e} className="text-xs text-red-300">{e}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={reset} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
              ← Nuovo file
            </button>
            <button onClick={goToPreview} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
              Anteprima →
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 3: ANTEPRIMA ───────────────────────────────────────────────── */}
      {step === 3 && form && (
        <div className="flex flex-col gap-4 max-w-2xl">
          <p className="text-sm text-slate-400">
            Verranno eseguite le seguenti operazioni per il movimento{' '}
            <span className="text-indigo-300 font-medium">{form.tipoMovimento}</span>{' '}
            in data <span className="text-slate-200">{form.decorrenza}</span>:
          </p>

          {/* Persona */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                isIngresso ? 'bg-green-900/50 text-green-300' : isUscita ? 'bg-red-900/50 text-red-300' : 'bg-blue-900/50 text-blue-300'
              }`}>
                {isIngresso ? 'CREA / AGGIORNA' : isUscita ? 'CHIUDE' : 'AGGIORNA'}
              </span>
              <span className="text-sm font-medium text-slate-200">Persona</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              {[
                ['CF', form.cf],
                ['Nominativo', `${form.cognome} ${form.nome}`],
                ['Sesso', form.sesso],
                ['Società', form.societa],
                ['Area', form.area],
                ['Qualifica', form.qualifica],
                ['Livello', form.livello],
                ['Tipo Contratto', form.tipo_contratto],
                ['RAL', form.ral ? `€${Number(form.ral).toLocaleString()}` : '—'],
                ['Part-time', `${form.part_time}%`],
                ['Sede', form.sede],
                ['Email', form.email],
              ].map(([k, v]) => v && (
                <div key={k} className="flex gap-1">
                  <span className="text-slate-500 w-28 shrink-0">{k}:</span>
                  <span className="text-slate-200 truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {isIngresso && (
            <div className="bg-amber-900/20 border border-amber-800 rounded-lg px-4 py-2.5 text-xs text-amber-300">
              ℹ La persona verrà creata in anagrafica ma <strong>non posizionata</strong> in organigramma.
              Potrai associarla manualmente dall&apos;Organigramma dopo l&apos;import.
            </div>
          )}

          {/* Supervisione */}
          {isIngresso && (form.cf_supervisore || form.referente_diretto) && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-green-900/50 text-green-300">CREA / AGGIORNA</span>
                <span className="text-sm font-medium text-slate-200">Supervisione Timesheet</span>
              </div>
              <div className="text-xs text-slate-400">
                {form.cf_supervisore
                  ? <>CF supervisore: <span className="font-mono text-slate-200">{form.cf_supervisore}</span></>
                  : <span className="text-amber-400">Supervisore non specificato — verrà creata la riga senza supervisore</span>
                }
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
              ← Modifica
            </button>
            <button
              onClick={execute}
              disabled={loading}
              className="px-5 py-2 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-md transition-colors"
            >
              {loading ? 'Esecuzione...' : '✓ Esegui import'}
            </button>
          </div>
        </div>
      )}

      {/* ─── STEP 4: RISULTATO ───────────────────────────────────────────────── */}
      {step === 4 && executeResult && (
        <div className="flex flex-col gap-4 max-w-xl">
          <div className={`border rounded-lg p-5 ${
            executeResult.success
              ? 'bg-green-900/20 border-green-700'
              : 'bg-red-900/20 border-red-700'
          }`}>
            <p className={`text-base font-semibold mb-3 ${executeResult.success ? 'text-green-300' : 'text-red-300'}`}>
              {executeResult.success ? '✓ Import completato' : '✕ Errore'}
            </p>
            {executeResult.error && (
              <p className="text-sm text-red-300 mb-3">{executeResult.error}</p>
            )}
            {executeResult.actions?.length > 0 && (
              <ul className="space-y-1">
                {executeResult.actions.map((a, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-green-500">·</span>{a}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={reset} className="self-start px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
            Importa un'altra scheda
          </button>
        </div>
      )}
    </div>
  )
}
