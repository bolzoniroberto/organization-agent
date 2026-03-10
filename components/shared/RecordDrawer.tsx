'use client'
import React, { useState, useEffect } from 'react'
import { X, Trash2, RotateCcw, Sparkles } from 'lucide-react'
import type { NodoOrganigramma, Persona } from '@/types'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import ConfirmDialog from './ConfirmDialog'

type Mode = 'view' | 'edit' | 'create'
type RecordType = 'nodo' | 'persona'

interface RecordDrawerProps {
  open: boolean
  type: RecordType
  record?: NodoOrganigramma | Persona | null
  initialMode?: Mode
  variant?: 'overlay' | 'panel'
  onClose: () => void
  onSaved?: () => void
}

const SL = 'text-xs uppercase tracking-wider text-slate-500 font-medium mb-2 mt-4 first:mt-0'
const FR = 'flex justify-between items-center py-1.5 border-b border-slate-800 last:border-0'
const FL = 'text-sm text-slate-400 shrink-0 w-40'
const FV = 'text-sm text-slate-200 text-right'

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className={FR}>
      <span className={FL}>{label}</span>
      <span className={value ? FV : 'text-slate-600 text-sm'}>
        {value || '—'}
      </span>
    </div>
  )
}

function FieldInput({ label, fieldKey, form, setForm, readOnly }: {
  label: string
  fieldKey: string
  form: Record<string, string>
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>
  readOnly?: boolean
}) {
  return (
    <div>
      <label className="text-xs text-slate-500 mb-1 block">{label}</label>
      <input
        readOnly={readOnly}
        className={[
          'w-full px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500',
          readOnly
            ? 'bg-slate-900 border-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-slate-800 border-slate-600 text-slate-200'
        ].join(' ')}
        value={form[fieldKey] ?? ''}
        onChange={e => !readOnly && setForm(f => ({ ...f, [fieldKey]: e.target.value }))}
      />
    </div>
  )
}

const TIPO_NODO_OPTS = ['STRUTTURA', 'PERSONA', 'ANOMALIA']

export default function RecordDrawer({
  open, type, record, initialMode = 'view', variant = 'overlay', onClose, onSaved
}: RecordDrawerProps) {
  const [mode, setMode] = useState<Mode>(initialMode)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [suggestingId, setSuggestingId] = useState(false)
  const { showToast, refreshAll } = useHRStore()

  const handleSuggestId = async () => {
    setSuggestingId(true)
    try {
      const prefix = form.reports_to ?? ''
      const res = await fetch(`/api/org/suggest-id?prefix=${encodeURIComponent(prefix)}`)
      const data = await res.json() as { id?: string; error?: string }
      if (data.id) setForm(f => ({ ...f, id: data.id! }))
    } catch {
      // silently ignore
    } finally {
      setSuggestingId(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setMode(record ? initialMode : 'create')
    setDeleteError(null)
    if (record) {
      const r = record as unknown as Record<string, unknown>
      const f: Record<string, string> = {}
      Object.keys(r).forEach(k => {
        if (r[k] !== null && r[k] !== undefined) f[k] = String(r[k])
      })
      setForm(f)
    } else {
      setForm({})
    }
  }, [open, record, initialMode])

  if (!open) return null

  const r = record as Record<string, unknown> | undefined
  const title = type === 'nodo'
    ? ((r?.nome_uo ?? r?.id) as string) ?? 'Nuovo Nodo'
    : (`${r?.cognome ?? ''} ${r?.nome ?? ''}`.trim() || (r?.cf as string)) ?? 'Nuova Persona'

  const handleSave = async () => {
    setSaving(true)
    try {
      let result: { success: boolean; error?: string }
      if (mode === 'create') {
        result = type === 'nodo'
          ? await api.org.create(form as Partial<NodoOrganigramma>)
          : await api.persone.create(form as Partial<Persona>)
      } else {
        result = type === 'nodo'
          ? await api.org.update(r!.id as string, form as Partial<NodoOrganigramma>)
          : await api.persone.update(r!.cf as string, form as Partial<Persona>)
      }
      if (result.success) {
        showToast('Salvato con successo', 'success')
        await refreshAll()
        setMode('view')
        onSaved?.()
      } else {
        showToast(result.error ?? 'Errore durante il salvataggio', 'error')
      }
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setConfirmDelete(false)
    try {
      const result = type === 'nodo'
        ? await api.org.delete(r!.id as string)
        : await api.persone.delete(r!.cf as string)
      if (result.success) {
        showToast('Eliminato con successo', 'success')
        await refreshAll()
        onClose()
      } else {
        setDeleteError((result as { message?: string }).message ?? 'Impossibile eliminare')
      }
    } catch (e) {
      setDeleteError(String(e))
    }
  }

  const handleRestore = async () => {
    try {
      const result = type === 'nodo'
        ? await api.org.restore(r!.id as string)
        : await api.persone.restore(r!.cf as string)
      if (result.success) {
        showToast('Ripristinato con successo', 'success')
        await refreshAll()
        onClose()
      }
    } catch (e) {
      showToast(String(e), 'error')
    }
  }

  const isDeleted = !!r?.deleted_at

  const nodoSections = () => (
    <>
      <p className={SL}>Identificativo</p>
      {mode !== 'view' ? (
        <div className="space-y-2">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">ID *</label>
            <div className="flex gap-1">
              <input
                readOnly={mode === 'edit'}
                className={[
                  'flex-1 px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500',
                  mode === 'edit'
                    ? 'bg-slate-900 border-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-800 border-slate-600 text-slate-200'
                ].join(' ')}
                value={form.id ?? ''}
                onChange={e => mode !== 'edit' && setForm(f => ({ ...f, id: e.target.value }))}
              />
              {mode === 'create' && (
                <button
                  onClick={handleSuggestId}
                  disabled={suggestingId}
                  title="Suggerisci ID"
                  className="px-2 py-1 text-indigo-400 hover:bg-indigo-900/30 border border-slate-600 rounded-md transition-colors disabled:opacity-40"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Tipo Nodo</label>
            <select value={form.tipo_nodo ?? 'STRUTTURA'}
              onChange={e => setForm(f => ({ ...f, tipo_nodo: e.target.value }))}
              className="w-full px-2 py-1 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {TIPO_NODO_OPTS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <FieldInput label="Reports To" fieldKey="reports_to" form={form} setForm={setForm} />
          <FieldInput label="CF Persona" fieldKey="cf_persona" form={form} setForm={setForm} />
        </div>
      ) : (
        <>
          <FieldRow label="ID" value={r?.id as string} />
          <FieldRow label="Tipo Nodo" value={r?.tipo_nodo as string} />
          <FieldRow label="Reports To" value={r?.reports_to as string} />
          <FieldRow label="CF Persona" value={r?.cf_persona as string} />
        </>
      )}

      <p className={SL}>Organizzativo</p>
      {mode !== 'view' ? (
        <div className="space-y-2">
          <FieldInput label="Nome UO" fieldKey="nome_uo" form={form} setForm={setForm} />
          <FieldInput label="Nome UO 2" fieldKey="nome_uo_2" form={form} setForm={setForm} />
          <FieldInput label="Centro Costo" fieldKey="centro_costo" form={form} setForm={setForm} />
          <FieldInput label="FTE" fieldKey="fte" form={form} setForm={setForm} />
          <FieldInput label="Job Title" fieldKey="job_title" form={form} setForm={setForm} />
          <FieldInput label="Funzione" fieldKey="funzione" form={form} setForm={setForm} />
          <FieldInput label="Processo" fieldKey="processo" form={form} setForm={setForm} />
        </div>
      ) : (
        <>
          <FieldRow label="Nome UO" value={r?.nome_uo as string} />
          <FieldRow label="Nome UO 2" value={r?.nome_uo_2 as string} />
          <FieldRow label="Centro Costo" value={r?.centro_costo as string} />
          <FieldRow label="FTE" value={r?.fte !== undefined ? String(r.fte) : null} />
          <FieldRow label="Job Title" value={r?.job_title as string} />
          <FieldRow label="Funzione" value={r?.funzione as string} />
          <FieldRow label="Processo" value={r?.processo as string} />
        </>
      )}

      <p className={SL}>Dettagli</p>
      {mode !== 'view' ? (
        <div className="space-y-2">
          <FieldInput label="Sede" fieldKey="sede" form={form} setForm={setForm} />
          <FieldInput label="Società Org" fieldKey="societa_org" form={form} setForm={setForm} />
          <FieldInput label="Testata GG" fieldKey="testata_gg" form={form} setForm={setForm} />
          <FieldInput label="Tipo Collab" fieldKey="tipo_collab" form={form} setForm={setForm} />
          <FieldInput label="Incarico SGSL" fieldKey="incarico_sgsl" form={form} setForm={setForm} />
          <FieldInput label="Note UO" fieldKey="note_uo" form={form} setForm={setForm} />
        </div>
      ) : (
        <>
          <FieldRow label="Sede" value={r?.sede as string} />
          <FieldRow label="Società Org" value={r?.societa_org as string} />
          <FieldRow label="Testata GG" value={r?.testata_gg as string} />
          <FieldRow label="Tipo Collab" value={r?.tipo_collab as string} />
          <FieldRow label="Incarico SGSL" value={r?.incarico_sgsl as string} />
          <FieldRow label="Note UO" value={r?.note_uo as string} />
        </>
      )}
    </>
  )

  const personaSections = () => (
    <>
      <p className={SL}>Anagrafica</p>
      {mode !== 'view' ? (
        <div className="space-y-2">
          <FieldInput label="CF *" fieldKey="cf" form={form} setForm={setForm} readOnly={mode === 'edit'} />
          <FieldInput label="Cognome" fieldKey="cognome" form={form} setForm={setForm} />
          <FieldInput label="Nome" fieldKey="nome" form={form} setForm={setForm} />
          <FieldInput label="Email" fieldKey="email" form={form} setForm={setForm} />
          <FieldInput label="Data Nascita" fieldKey="data_nascita" form={form} setForm={setForm} />
        </div>
      ) : (
        <>
          <FieldRow label="Codice Fiscale" value={r?.cf as string} />
          <FieldRow label="Cognome" value={r?.cognome as string} />
          <FieldRow label="Nome" value={r?.nome as string} />
          <FieldRow label="Email" value={r?.email as string} />
          <FieldRow label="Data Nascita" value={r?.data_nascita as string} />
        </>
      )}

      <p className={SL}>Contratto</p>
      {mode !== 'view' ? (
        <div className="space-y-2">
          <FieldInput label="Società" fieldKey="societa" form={form} setForm={setForm} />
          <FieldInput label="Area" fieldKey="area" form={form} setForm={setForm} />
          <FieldInput label="Qualifica" fieldKey="qualifica" form={form} setForm={setForm} />
          <FieldInput label="Tipo Contratto" fieldKey="tipo_contratto" form={form} setForm={setForm} />
          <FieldInput label="Data Assunzione" fieldKey="data_assunzione" form={form} setForm={setForm} />
        </div>
      ) : (
        <>
          <FieldRow label="Società" value={r?.societa as string} />
          <FieldRow label="Area" value={r?.area as string} />
          <FieldRow label="Qualifica" value={r?.qualifica as string} />
          <FieldRow label="Tipo Contratto" value={r?.tipo_contratto as string} />
          <FieldRow label="Data Assunzione" value={r?.data_assunzione as string} />
        </>
      )}

      <p className={SL}>Presenza</p>
      {mode !== 'view' ? (
        <div className="space-y-2">
          <FieldInput label="Modalità Presenze" fieldKey="modalita_presenze" form={form} setForm={setForm} />
          <FieldInput label="Sede" fieldKey="sede" form={form} setForm={setForm} />
          <FieldInput label="CdC Amministrativo" fieldKey="cdc_amministrativo" form={form} setForm={setForm} />
        </div>
      ) : (
        <>
          <FieldRow label="Modalità Presenze" value={r?.modalita_presenze as string} />
          <FieldRow label="Sede" value={r?.sede as string} />
          <FieldRow label="CdC Amministrativo" value={r?.cdc_amministrativo as string} />
        </>
      )}
    </>
  )

  const content = (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {type === 'nodo' ? nodoSections() : personaSections()}

        {deleteError && (
          <div className="mt-4 bg-red-900/30 border border-red-700 text-red-300 text-sm rounded-md px-3 py-2">{deleteError}</div>
        )}

        {mode === 'view' && record && (
          <div className="pt-4 mt-4 border-t border-slate-800 flex flex-col gap-2">
            {isDeleted ? (
              <button onClick={handleRestore}
                className="flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
                Ripristina
              </button>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
                Elimina {type === 'nodo' ? 'nodo' : 'persona'}
              </button>
            )}
          </div>
        )}
      </div>

      {mode !== 'view' && (
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-700">
          <button onClick={() => record ? setMode('view') : onClose()}
            className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors">
            Annulla
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium">
            {saving ? 'Salvataggio…' : 'Salva'}
          </button>
        </div>
      )}
    </>
  )

  const header = (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700">
      <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
        <X className="w-4 h-4" />
      </button>
      <h2 className="font-semibold text-slate-100 text-sm flex-1 truncate">
        {isDeleted && <span className="text-red-400 text-xs mr-2">[ELIMINATO]</span>}
        {title}
      </h2>
      {mode === 'view' && record && !isDeleted && (
        <button onClick={() => setMode('edit')} className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">
          Modifica
        </button>
      )}
    </div>
  )

  const dialogs = (
    <ConfirmDialog
      open={confirmDelete}
      title={`Elimina ${type === 'nodo' ? 'nodo' : 'persona'}`}
      message={`Sei sicuro di voler eliminare "${title}"? L'operazione è reversibile.`}
      confirmLabel="Elimina"
      onConfirm={handleDelete}
      onCancel={() => setConfirmDelete(false)}
    />
  )

  if (variant === 'panel') {
    return (
      <>
        <div className="h-full w-full flex flex-col bg-slate-900">
          {header}
          {content}
        </div>
        {dialogs}
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-30" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[480px] bg-slate-900 border-l border-slate-700 shadow-2xl z-40 flex flex-col"
        style={{ animation: 'slideInRight 200ms ease-out' }}>
        {header}
        {content}
      </div>
      {dialogs}
    </>
  )
}
