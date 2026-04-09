'use client'
import React, { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { useHRStore } from '@/store/useHRStore'
import VariabiliManager from './AnagraficaView/VariabiliManager'

type SubTab = 'generale' | 'variabili' | 'campi-discreti'

interface DiscreteField {
  table: string
  field: string
  label: string
  entity: string
  values: string[]
}

export default function ImpostazioniView() {
  const { companyName, platformName, saveSetting } = useHRStore()
  const [subTab, setSubTab] = useState<SubTab>('generale')

  // Generale
  const [editCompany, setEditCompany] = useState(companyName)
  const [editPlatform, setEditPlatform] = useState(platformName)
  const [savingGeneral, setSavingGeneral] = useState(false)
  const [savedGeneral, setSavedGeneral] = useState(false)

  // Campi discreti
  const [fields, setFields] = useState<DiscreteField[]>([])
  const [loadingFields, setLoadingFields] = useState(false)
  const [expandedField, setExpandedField] = useState<string | null>(null)
  // editing: key = `table.field::value`, value = current edit string
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [renaming, setRenaming] = useState<Record<string, boolean>>({})
  const [renameResult, setRenameResult] = useState<Record<string, string>>({})

  useEffect(() => {
    setEditCompany(companyName)
    setEditPlatform(platformName)
  }, [companyName, platformName])

  useEffect(() => {
    if (subTab === 'campi-discreti' && fields.length === 0) {
      setLoadingFields(true)
      api.settings.discrete()
        .then(r => setFields(r.fields))
        .finally(() => setLoadingFields(false))
    }
  }, [subTab, fields.length])

  const handleSaveGeneral = async () => {
    setSavingGeneral(true)
    try {
      await Promise.all([
        saveSetting('company_name', editCompany),
        saveSetting('platform_name', editPlatform),
      ])
      setSavedGeneral(true)
      setTimeout(() => setSavedGeneral(false), 2000)
    } finally {
      setSavingGeneral(false)
    }
  }

  const fieldKey = (f: DiscreteField) => `${f.table}.${f.field}`
  const editKey = (f: DiscreteField, v: string) => `${fieldKey(f)}::${v}`

  const startEdit = (f: DiscreteField, v: string) => {
    setEditing(prev => ({ ...prev, [editKey(f, v)]: v }))
  }
  const cancelEdit = (f: DiscreteField, v: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[editKey(f, v)]; return n })
    setRenameResult(prev => { const n = { ...prev }; delete n[editKey(f, v)]; return n })
  }
  const applyRename = async (f: DiscreteField, oldVal: string) => {
    const key = editKey(f, oldVal)
    const newVal = editing[key]?.trim()
    if (!newVal || newVal === oldVal) { cancelEdit(f, oldVal); return }
    setRenaming(prev => ({ ...prev, [key]: true }))
    try {
      const res = await api.settings.renameDiscreteValue(f.table, f.field, oldVal, newVal)
      if (res.error) { setRenameResult(prev => ({ ...prev, [key]: `Errore: ${res.error}` })); return }
      setRenameResult(prev => ({ ...prev, [key]: `${res.updated} record aggiornati` }))
      setFields(prev => prev.map(pf => pf.table === f.table && pf.field === f.field
        ? { ...pf, values: pf.values.map(v => v === oldVal ? newVal : v) }
        : pf
      ))
      setTimeout(() => cancelEdit(f, newVal), 1500)
    } finally {
      setRenaming(prev => { const n = { ...prev }; delete n[key]; return n })
    }
  }

  const tabs: { id: SubTab; label: string }[] = [
    { id: 'generale', label: 'Generale' },
    { id: 'variabili', label: 'Variabili Integrative' },
    { id: 'campi-discreti', label: 'Campi Discreti' },
  ]

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* Sub-tabs */}
      <div className="flex-none flex items-center gap-1 px-4 pt-3 pb-0 border-b border-slate-700/60">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={[
              'px-4 py-2 text-sm font-medium rounded-t border-b-2 transition-colors',
              subTab === t.id
                ? 'border-indigo-500 text-indigo-300 bg-slate-800/50'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/30'
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">

        {subTab === 'generale' && (
          <div className="max-w-lg space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-200 mb-4">Identità della piattaforma</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nome azienda</label>
                  <input
                    type="text"
                    value={editCompany}
                    onChange={e => setEditCompany(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    placeholder="es. Sole 24 Ore"
                  />
                  <p className="text-xs text-slate-500 mt-1">Mostrato nel menu in alto a fianco del nome piattaforma</p>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nome piattaforma</label>
                  <input
                    type="text"
                    value={editPlatform}
                    onChange={e => setEditPlatform(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                    placeholder="es. HR Platform"
                  />
                </div>
              </div>
              <div className="mt-5 flex items-center gap-3">
                <button
                  onClick={handleSaveGeneral}
                  disabled={savingGeneral}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
                >
                  {savingGeneral ? 'Salvataggio...' : 'Salva'}
                </button>
                {savedGeneral && <span className="text-xs text-green-400">Salvato</span>}
              </div>
            </div>
          </div>
        )}

        {subTab === 'variabili' && (
          <VariabiliManager />
        )}

        {subTab === 'campi-discreti' && (
          <div className="max-w-3xl">
            <p className="text-xs text-slate-400 mb-4">
              Valori distinti dei campi categorici nel database. Utili come riferimento per la validazione dei dati.
            </p>
            {loadingFields ? (
              <div className="text-sm text-slate-500">Caricamento...</div>
            ) : (
              <div className="space-y-2">
                {fields.map(f => {
                  const key = fieldKey(f)
                  const isExpanded = expandedField === key
                  return (
                    <div key={key} className="bg-slate-800/60 border border-slate-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedField(isExpanded ? null : key)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm text-left hover:bg-slate-700/40 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-slate-200 font-medium">{f.label}</span>
                          <span className="text-xs text-slate-500 font-mono">{f.table}.{f.field}</span>
                          <span className={[
                            'text-xs px-1.5 py-0.5 rounded',
                            f.entity === 'persona' ? 'bg-blue-900/40 text-blue-300' : 'bg-purple-900/40 text-purple-300'
                          ].join(' ')}>
                            {f.entity === 'persona' ? 'Persona' : 'Nodo'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{f.values.length} valori</span>
                          <span className="text-slate-500">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-4 pb-4 border-t border-slate-700">
                          <p className="text-xs text-slate-500 mt-3 mb-2">
                            Clicca su un valore per rinominarlo su tutti i record. L&apos;operazione è immediata e viene registrata nel changelog.
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {f.values.length === 0 ? (
                              <span className="text-xs text-slate-500 italic">Nessun valore presente</span>
                            ) : (
                              f.values.map(v => {
                                const ek = editKey(f, v)
                                const isEditing = ek in editing
                                const isLoading = renaming[ek]
                                const result = renameResult[ek]
                                return (
                                  <div key={v} className="flex items-center gap-2">
                                    {isEditing ? (
                                      <>
                                        <input
                                          autoFocus
                                          type="text"
                                          value={editing[ek]}
                                          onChange={e => setEditing(prev => ({ ...prev, [ek]: e.target.value }))}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') applyRename(f, v)
                                            if (e.key === 'Escape') cancelEdit(f, v)
                                          }}
                                          className="w-48 bg-slate-700 border border-indigo-500 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none"
                                        />
                                        <button
                                          onClick={() => applyRename(f, v)}
                                          disabled={isLoading}
                                          className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded transition-colors"
                                        >
                                          {isLoading ? '...' : 'Applica'}
                                        </button>
                                        <button
                                          onClick={() => cancelEdit(f, v)}
                                          className="text-xs px-2 py-1 text-slate-400 hover:text-slate-200 transition-colors"
                                        >
                                          Annulla
                                        </button>
                                        {result && (
                                          <span className={`text-xs ${result.startsWith('Errore') ? 'text-red-400' : 'text-green-400'}`}>
                                            {result}
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => startEdit(f, v)}
                                        className="group flex items-center gap-2 text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded border border-slate-600 hover:border-slate-500 transition-colors"
                                        title="Clicca per rinominare"
                                      >
                                        {v}
                                        <span className="text-slate-500 group-hover:text-slate-300 text-[10px]">✎</span>
                                      </button>
                                    )}
                                  </div>
                                )
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
