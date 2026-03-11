'use client'
import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { EntityTarget } from './StepEntity'
import type { VarTarget } from '@/types'
import { useHRStore } from '@/store/useHRStore'
import { api } from '@/lib/api'

interface StepMappingProps {
  headers: string[]
  sampleRows: Record<string, unknown>[]
  entity: EntityTarget
  mapping: Record<string, string>
  keyField: string
  onMappingChange: (mapping: Record<string, string>) => void
  onKeyFieldChange: (k: string) => void
  onNext: () => void
  onBack: () => void
}

// Campi nativi per entità + quale è la PK naturale (default join key)
const ENTITY_FIELDS: Record<EntityTarget, { field: string; label: string }[]> = {
  nodi_org: [
    { field: 'id', label: 'ID Posizione' },
    { field: 'reports_to', label: 'Reports To' },
    { field: 'tipo_nodo', label: 'Tipo Nodo' },
    { field: 'cf_persona', label: 'CF Persona (TxCodFiscale)' },
    { field: 'nome_uo', label: 'Nome UO (Unità Organizzativa)' },
    { field: 'nome_uo_2', label: 'Nome UO 2' },
    { field: 'centro_costo', label: 'Centro di Costo (CdC)' },
    { field: 'fte', label: 'FTE' },
    { field: 'job_title', label: 'Job Title' },
    { field: 'funzione', label: 'Funzione' },
    { field: 'processo', label: 'Processo' },
    { field: 'incarico_sgsl', label: 'Incarico SGSL' },
    { field: 'societa_org', label: 'Società Org' },
    { field: 'testata_gg', label: 'Testata GG' },
    { field: 'sede', label: 'Sede' },
    { field: 'tipo_collab', label: 'Tipo Collaborazione' },
    { field: 'note_uo', label: 'Note UO' },
  ],
  persone: [
    { field: 'cf', label: 'Codice Fiscale' },
    { field: 'cognome', label: 'Cognome' },
    { field: 'nome', label: 'Nome' },
    { field: 'data_nascita', label: 'Data di Nascita' },
    { field: 'sesso', label: 'Sesso' },
    { field: 'email', label: 'Email (INDIRIZZO EMAIL)' },
    { field: 'matricola', label: 'Matricola (Codice dipendente)' },
    { field: 'societa', label: 'Società (Azienda)' },
    { field: 'area', label: 'Area (Struttura liv. 1)' },
    { field: 'sotto_area', label: 'Sotto Area (Struttura liv. 2)' },
    { field: 'cdc_amministrativo', label: 'CdC Amministrativo' },
    { field: 'sede', label: 'Sede (Codice sede / Desc. sede)' },
    { field: 'data_assunzione', label: 'Data Assunzione' },
    { field: 'data_fine_rapporto', label: 'Data Cessazione' },
    { field: 'tipo_contratto', label: 'Tipo Contratto (Desc. contratto)' },
    { field: 'qualifica', label: 'Qualifica (Desc. qualifica)' },
    { field: 'livello', label: 'Livello (Desc. livello)' },
    { field: 'modalita_presenze', label: 'Modalità Presenze' },
    { field: 'part_time', label: '% Part Time (300 - % Ptime)' },
    { field: 'ral', label: 'RAL (4900 - RAL)' },
  ],
  timesheet: [
    { field: 'cf_dipendente', label: 'CF Dipendente' },
    { field: 'cf_supervisore', label: 'CF Supervisore (Primo responsabile)' },
    { field: 'data_inizio', label: 'Data Inizio' },
    { field: 'data_fine', label: 'Data Fine' },
  ],
  tns: [
    { field: 'cf_persona', label: 'CF Persona (TxCodFiscale)' },
    { field: 'codice_tns', label: 'Codice TNS (Codice)' },
    { field: 'padre_tns', label: 'Padre TNS (Unità Op. Padre)' },
    { field: 'livello_tns', label: 'Livello TNS (LIVELLO)' },
    { field: 'titolare_tns', label: 'Titolare TNS (DESCRIZIONE)' },
    { field: 'tipo_approvatore', label: 'Tipo Approvatore' },
    { field: 'codice_approvatore', label: 'Codice Approvatore' },
    { field: 'cdc_tns', label: 'CdC TNS (CDCCOSTO)' },
    { field: 'sede_tns', label: 'Sede TNS' },
    { field: 'viaggiatore', label: 'Viaggiatore' },
    { field: 'segr_redaz', label: 'Segr. Redaz. (Segr_Redaz)' },
    { field: 'approvatore', label: 'Approvatore' },
    { field: 'cassiere', label: 'Cassiere' },
    { field: 'visualizzatore', label: 'Visualizzatori' },
    { field: 'segretario', label: 'Segretario' },
    { field: 'controllore', label: 'Controllore' },
    { field: 'amministrazione', label: 'Amministrazione' },
    { field: 'segreteria_red_asst', label: 'Segreteria Red. Ass.ta' },
    { field: 'segretario_asst', label: 'Segretario Ass.to' },
    { field: 'controllore_asst', label: 'Controllore Ass.to' },
    { field: 'ruoli_oltrv', label: 'Ruoli OltreV (RUOLI OltreV)' },
    { field: 'ruoli', label: 'Ruoli (RUOLI)' },
    { field: 'ruoli_afc', label: 'Ruoli AFC' },
    { field: 'ruoli_hr', label: 'Ruoli HR' },
    { field: 'altri_ruoli', label: 'Altri Ruoli' },
    { field: 'gruppo_sind', label: 'Gruppo Sindacale (GruppoSind)' },
    { field: 'escluso_tns', label: 'Escluso TNS' },
  ],
  strutture_tns: [
    { field: 'codice', label: 'Codice Struttura (Codice)' },
    { field: 'nome', label: 'Nome (Unità Organizzativa)' },
    { field: 'padre', label: 'Padre (Unità Op. Padre)' },
    { field: 'livello', label: 'Livello (LIVELLO)' },
    { field: 'tipo', label: 'Tipo' },
    { field: 'descrizione', label: 'Descrizione (DESCRIZIONE)' },
    { field: 'cdc', label: 'CdC (CDCCOSTO)' },
    { field: 'titolare', label: 'Titolare (Titolare)' },
    { field: 'cf_titolare', label: 'CF Titolare (TxCodFiscale)' },
    { field: 'sede_tns', label: 'Sede TNS' },
    { field: 'viaggiatore', label: 'Viaggiatore' },
    { field: 'segr_redaz', label: 'Segr. Redaz. (Segr_Redaz)' },
    { field: 'approvatore', label: 'Approvatore' },
    { field: 'cassiere', label: 'Cassiere' },
    { field: 'visualizzatore', label: 'Visualizzatori' },
    { field: 'segretario', label: 'Segretario' },
    { field: 'controllore', label: 'Controllore' },
    { field: 'amministrazione', label: 'Amministrazione' },
    { field: 'segreteria_red_asst', label: 'Segreteria Red. Ass.ta' },
    { field: 'segretario_asst', label: 'Segretario Ass.to' },
    { field: 'controllore_asst', label: 'Controllore Ass.to' },
    { field: 'ruoli_oltrv', label: 'Ruoli OltreV' },
    { field: 'ruoli', label: 'Ruoli' },
    { field: 'ruoli_afc', label: 'Ruoli AFC' },
    { field: 'ruoli_hr', label: 'Ruoli HR' },
    { field: 'altri_ruoli', label: 'Altri Ruoli' },
    { field: 'gruppo_sind', label: 'Gruppo Sindacale' },
    { field: 'attivo', label: 'Attivo' },
  ],
}

export const NATURAL_KEY: Record<EntityTarget, string> = {
  nodi_org: 'id',
  persone: 'cf',
  timesheet: 'cf_dipendente',
  tns: 'cf_persona',
  strutture_tns: 'codice',
}

const ENTITY_VAR_TARGET: Record<EntityTarget, VarTarget> = {
  nodi_org: 'nodo',
  persone: 'persona',
  timesheet: 'timesheet',
  tns: 'tns',
  strutture_tns: 'struttura_tns',
}

const TIPI = ['TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'SELECT'] as const

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function ColumnPreview({ col, sampleRows }: { col: string; sampleRows: Record<string, unknown>[] }) {
  if (!col) return null
  const vals = sampleRows
    .map(r => String(r[col] ?? '').trim())
    .filter(Boolean)
    .slice(0, 4)
  if (!vals.length) return null
  return (
    <div className="flex gap-1 flex-wrap mt-0.5">
      {vals.map((v, i) => (
        <span key={i} className="text-xs bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded truncate max-w-[120px]" title={v}>{v}</span>
      ))}
    </div>
  )
}

export default function StepMapping({
  headers, sampleRows, entity, mapping, keyField, onMappingChange, onKeyFieldChange, onNext, onBack,
}: StepMappingProps) {
  const { variabiliDef, refreshVariabiliDef, showToast } = useHRStore()
  const fields = ENTITY_FIELDS[entity] ?? []
  const naturalKey = NATURAL_KEY[entity]
  const isAlternativeKey = keyField !== naturalKey
  const entityVarTarget = ENTITY_VAR_TARGET[entity]

  const compatibleVars = variabiliDef.filter(v =>
    v.target === 'tutti' || v.target === entityVarTarget
  )

  // Nuova variabile inline
  const [showNewVar, setShowNewVar] = useState(false)
  const [newVarLabel, setNewVarLabel] = useState('')
  const [newVarTipo, setNewVarTipo] = useState<typeof TIPI[number]>('TEXT')
  const [newVarCol, setNewVarCol] = useState('')
  const [creatingVar, setCreatingVar] = useState(false)

  const updateMapping = (field: string, header: string) => {
    const next = { ...mapping }
    if (header === '') delete next[field]
    else next[field] = header
    onMappingChange(next)
  }

  const handleCreateVar = async () => {
    if (!newVarLabel.trim() || !newVarCol) return
    setCreatingVar(true)
    try {
      const res = await api.variabili.createDefinizione({
        nome: slugify(newVarLabel),
        label: newVarLabel.trim(),
        tipo: newVarTipo,
        target: entityVarTarget,
      })
      if (!res.success || !res.id) { showToast(res.error ?? 'Errore creazione variabile', 'error'); return }
      await refreshVariabiliDef()
      updateMapping(`var_${res.id}`, newVarCol)
      setNewVarLabel(''); setNewVarCol(''); setNewVarTipo('TEXT'); setShowNewVar(false)
      showToast(`Variabile "${newVarLabel}" creata`, 'success')
    } catch (e) {
      showToast(String(e), 'error')
    } finally {
      setCreatingVar(false)
    }
  }

  const hasKey = !!mapping[keyField]

  return (
    <div className="flex flex-col gap-6 py-6 px-6 max-w-2xl mx-auto w-full">

      {/* Selettore chiave di join + mapping chiave — obbligatorio */}
      <div className={`border rounded-lg p-4 ${hasKey ? 'bg-slate-800 border-slate-600' : 'bg-amber-950/30 border-amber-600'}`}>
        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">
          ⚠ Campo chiave per il join — obbligatorio per procedere
        </p>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <p className="text-xs text-slate-500 mb-1">Quale campo del sistema usare come chiave?</p>
            <select
              value={keyField}
              onChange={e => onKeyFieldChange(e.target.value)}
              className="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-500 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {fields.map(f => (
                <option key={f.field} value={f.field}>
                  {f.label} {f.field === naturalKey ? '(chiave primaria)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <p className="text-xs text-slate-500 mb-1">Colonna del file corrispondente</p>
            <select
              value={mapping[keyField] ?? ''}
              onChange={e => updateMapping(keyField, e.target.value)}
              className={`w-full px-2 py-1.5 text-sm bg-slate-900 border rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${hasKey ? 'border-green-600' : 'border-amber-600'}`}
            >
              <option value="">— seleziona colonna —</option>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            {mapping[keyField] && <ColumnPreview col={mapping[keyField]} sampleRows={sampleRows} />}
          </div>
        </div>
        {isAlternativeKey && (
          <p className="text-xs text-amber-300 mt-2">
            Chiave alternativa: il sistema cercherà record con <code className="font-mono bg-slate-700 px-1 rounded">{keyField}</code> corrispondente.
            I record non trovati verranno saltati.
          </p>
        )}
      </div>

      {/* Mapping colonne — campi nativi */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-4">Mappa le colonne del file sui campi del sistema</h3>
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f.field}>
              <div className="flex items-center gap-3">
                <div className="w-48 flex-shrink-0 flex items-center gap-1">
                  <span className="text-sm text-slate-300">{f.label}</span>
                  {f.field === keyField && <span className="text-xs text-amber-400 font-medium">*chiave</span>}
                </div>
                <select
                  value={mapping[f.field] ?? ''}
                  onChange={e => updateMapping(f.field, e.target.value)}
                  className={[
                    'flex-1 px-2 py-1.5 text-sm bg-slate-800 border rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500',
                    f.field === keyField ? 'border-amber-600' : 'border-slate-600'
                  ].join(' ')}
                >
                  <option value="">— non mappare —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              {mapping[f.field] && <ColumnPreview col={mapping[f.field]} sampleRows={sampleRows} />}
            </div>
          ))}
        </div>

        {/* Variabili integrative esistenti */}
        <div className="mt-6">
          <div className="flex items-center gap-3 mb-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Variabili Integrative</p>
            <button
              onClick={() => setShowNewVar(v => !v)}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Nuova variabile dal file
            </button>
          </div>

          {/* Form nuova variabile inline */}
          {showNewVar && (
            <div className="mb-3 p-3 bg-indigo-950/40 border border-indigo-800 rounded-lg space-y-2">
              <p className="text-xs text-indigo-300 font-medium">Crea una nuova variabile integrativa</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Label (es. Budget Formazione)"
                  value={newVarLabel}
                  onChange={e => setNewVarLabel(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <select
                  value={newVarTipo}
                  onChange={e => setNewVarTipo(e.target.value as typeof TIPI[number])}
                  className="px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none"
                >
                  {TIPI.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <select
                    value={newVarCol}
                    onChange={e => setNewVarCol(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-slate-800 border border-slate-600 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">— seleziona colonna del file —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {newVarCol && <ColumnPreview col={newVarCol} sampleRows={sampleRows} />}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={handleCreateVar}
                    disabled={!newVarLabel.trim() || !newVarCol || creatingVar}
                    className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-40"
                  >
                    {creatingVar ? '…' : 'Crea'}
                  </button>
                  <button onClick={() => setShowNewVar(false)} className="p-1.5 text-slate-500 hover:text-slate-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {compatibleVars.length > 0 && (
            <div className="space-y-3">
              {compatibleVars.map(v => (
                <div key={v.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-48 flex-shrink-0">
                      <span className="text-sm text-indigo-300">{v.label}</span>
                      <span className="ml-1 text-xs text-slate-500">({v.tipo})</span>
                    </div>
                    <select
                      value={mapping[`var_${v.id}`] ?? ''}
                      onChange={e => updateMapping(`var_${v.id}`, e.target.value)}
                      className="flex-1 px-2 py-1.5 text-sm bg-slate-800 border border-indigo-800 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">— non mappare —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  {mapping[`var_${v.id}`] && <ColumnPreview col={mapping[`var_${v.id}`]} sampleRows={sampleRows} />}
                </div>
              ))}
            </div>
          )}

          {compatibleVars.length === 0 && !showNewVar && (
            <p className="text-xs text-slate-600 italic">Nessuna variabile integrativa definita per questa entità.</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 items-center">
        <button onClick={onBack}
          className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          ← Indietro
        </button>
        <button onClick={onNext} disabled={!hasKey}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium">
          Anteprima →
        </button>
        {!hasKey && (
          <span className="text-xs text-amber-400">Seleziona la colonna chiave in cima per continuare</span>
        )}
      </div>
    </div>
  )
}
