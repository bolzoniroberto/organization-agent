'use client'
import React, { useState } from 'react'
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import type { VariabileOrgDefinizione } from '@/types'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'
import ConfirmDialog from '@/components/shared/ConfirmDialog'

const TIPI = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'] as const
const TARGETS = ['nodo', 'persona', 'entrambi'] as const

function slugify(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

interface VarFormState {
  nome: string
  label: string
  tipo: typeof TIPI[number]
  target: typeof TARGETS[number]
  opzioni: string
  descrizione: string
}

const DEFAULT_FORM: VarFormState = {
  nome: '', label: '', tipo: 'TEXT', target: 'nodo', opzioni: '', descrizione: ''
}

export default function VariabiliManager() {
  const { variabiliDef, refreshVariabiliDef, showToast } = useHRStore()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<VarFormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<VariabileOrgDefinizione | null>(null)

  const openCreate = () => {
    setEditingId(null)
    setForm(DEFAULT_FORM)
    setShowForm(true)
  }

  const openEdit = (v: VariabileOrgDefinizione) => {
    setEditingId(v.id)
    setForm({
      nome: v.nome,
      label: v.label,
      tipo: v.tipo,
      target: v.target,
      opzioni: v.opzioni ? JSON.parse(v.opzioni).join(', ') : '',
      descrizione: v.descrizione ?? ''
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.label.trim()) { showToast('Label obbligatoria', 'error'); return }
    setSaving(true)
    try {
      const payload: Partial<VariabileOrgDefinizione> = {
        nome: form.nome || slugify(form.label),
        label: form.label,
        tipo: form.tipo,
        target: form.target,
        opzioni: form.tipo === 'SELECT' && form.opzioni
          ? JSON.stringify(form.opzioni.split(',').map(s => s.trim()).filter(Boolean))
          : null,
        descrizione: form.descrizione || null,
      }
      const result = editingId
        ? await api.variabili.updateDefinizione(editingId, payload)
        : await api.variabili.createDefinizione(payload)
      if (result.success) {
        showToast(editingId ? 'Variabile aggiornata' : 'Variabile creata', 'success')
        await refreshVariabiliDef()
        setShowForm(false)
      } else {
        showToast(result.error ?? 'Errore', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (v: VariabileOrgDefinizione) => {
    setDeleteConfirm(null)
    const result = await api.variabili.deleteDefinizione(v.id)
    if (result.success) {
      showToast('Variabile eliminata', 'success')
      await refreshVariabiliDef()
    } else if (result.count !== undefined) {
      showToast(`Impossibile eliminare: ${result.count} valori associati`, 'error')
    } else {
      showToast(result.error ?? 'Errore', 'error')
    }
  }

  const TIPO_BADGE: Record<string, string> = {
    TEXT: 'bg-slate-700 text-slate-300',
    NUMBER: 'bg-blue-900/50 text-blue-300',
    DATE: 'bg-green-900/50 text-green-300',
    BOOLEAN: 'bg-purple-900/50 text-purple-300',
    SELECT: 'bg-amber-900/50 text-amber-300',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700">
        <span className="text-sm font-medium text-slate-200">Variabili Integrative</span>
        <span className="text-xs text-slate-500">({variabiliDef.length} definite)</span>
        <div className="flex-1" />
        <button onClick={openCreate}
          className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 transition-colors font-medium">
          <Plus className="w-3.5 h-3.5" />
          Nuova Variabile
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {variabiliDef.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <p className="text-sm">Nessuna variabile definita</p>
            <p className="text-xs mt-1">Clicca "+ Nuova Variabile" per iniziare</p>
          </div>
        ) : (
          <div className="space-y-2">
            {variabiliDef.map(v => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">{v.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${TIPO_BADGE[v.tipo] ?? 'bg-slate-700 text-slate-300'}`}>
                      {v.tipo}
                    </span>
                    <span className="text-xs text-slate-500">→ {v.target}</span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">{v.nome}</div>
                  {v.descrizione && <div className="text-xs text-slate-400 mt-1">{v.descrizione}</div>}
                  {v.tipo === 'SELECT' && v.opzioni && (
                    <div className="text-xs text-slate-500 mt-1">
                      Opzioni: {JSON.parse(v.opzioni).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(v)}
                    className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteConfirm(v)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-slate-900 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-5">
              <h3 className="text-sm font-semibold text-slate-100 flex-1">
                {editingId ? 'Modifica Variabile' : 'Nuova Variabile'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Label *</label>
                <input value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value, nome: f.nome || slugify(e.target.value) }))}
                  className="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="es. Budget UO" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Nome (slug)</label>
                <input value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-400 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="auto-generato" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as typeof TIPI[number] }))}
                    className="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    {TIPI.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Target</label>
                  <select value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value as typeof TARGETS[number] }))}
                    className="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    {TARGETS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {form.tipo === 'SELECT' && (
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Opzioni (separate da virgola)</label>
                  <input value={form.opzioni}
                    onChange={e => setForm(f => ({ ...f, opzioni: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Basso, Medio, Alto" />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Descrizione</label>
                <input value={form.descrizione}
                  onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors">
                Annulla
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium">
                <Check className="w-3.5 h-3.5" />
                {saving ? 'Salvataggio…' : 'Salva'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title="Elimina variabile"
        message={`Eliminare "${deleteConfirm?.label}"? Verranno eliminati anche tutti i valori associati.`}
        confirmLabel="Elimina"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}
