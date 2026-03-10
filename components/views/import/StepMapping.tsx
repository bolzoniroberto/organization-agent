'use client'
import React from 'react'
import type { EntityTarget } from './StepEntity'
import { useHRStore } from '@/store/useHRStore'

interface StepMappingProps {
  headers: string[]
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

export default function StepMapping({
  headers, entity, mapping, keyField, onMappingChange, onKeyFieldChange, onNext, onBack,
}: StepMappingProps) {
  const { variabiliDef } = useHRStore()
  const fields = ENTITY_FIELDS[entity] ?? []
  const naturalKey = NATURAL_KEY[entity]
  const isAlternativeKey = keyField !== naturalKey

  const compatibleVars = variabiliDef.filter(v =>
    (entity === 'nodi_org' && (v.target === 'nodo' || v.target === 'entrambi')) ||
    (entity === 'persone' && (v.target === 'persona' || v.target === 'entrambi'))
  )

  const updateMapping = (field: string, header: string) => {
    const next = { ...mapping }
    if (header === '') delete next[field]
    else next[field] = header
    onMappingChange(next)
  }

  const hasKey = !!mapping[keyField]

  return (
    <div className="flex flex-col gap-6 py-6 px-6 max-w-2xl mx-auto w-full">

      {/* Selettore chiave di join */}
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Campo chiave per il join</p>
        <div className="flex items-center gap-3">
          <select
            value={keyField}
            onChange={e => onKeyFieldChange(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm bg-slate-900 border border-slate-500 rounded-md text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {fields.map(f => (
              <option key={f.field} value={f.field}>
                {f.label} {f.field === naturalKey ? '(chiave primaria)' : ''}
              </option>
            ))}
          </select>
        </div>
        {isAlternativeKey && (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-amber-300">
              Chiave alternativa: il sistema cercherà record con <code className="font-mono bg-slate-700 px-1 rounded">{keyField}</code> corrispondente.
            </p>
            <p className="text-xs text-slate-500">
              I record non trovati verranno saltati (INSERT non possibile senza la chiave primaria <code className="font-mono">{naturalKey}</code>).
            </p>
          </div>
        )}
      </div>

      {/* Mapping colonne */}
      <div>
        <h3 className="text-sm font-medium text-slate-300 mb-4">Mappa le colonne del file sui campi del sistema</h3>

        <div className="space-y-2">
          {fields.map(f => (
            <div key={f.field} className={`flex items-center gap-3 ${f.field === keyField ? 'opacity-100' : ''}`}>
              <div className="w-48 flex-shrink-0 flex items-center gap-1">
                <span className="text-sm text-slate-300">{f.label}</span>
                {f.field === keyField && (
                  <span className="text-xs text-amber-400 font-medium">*chiave</span>
                )}
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
          ))}
        </div>

        {compatibleVars.length > 0 && (
          <>
            <p className="text-xs text-slate-500 uppercase tracking-wider mt-6 mb-3">Variabili Integrative</p>
            <div className="space-y-2">
              {compatibleVars.map(v => (
                <div key={v.id} className="flex items-center gap-3">
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
              ))}
            </div>
          </>
        )}
      </div>

      {!hasKey && (
        <p className="text-xs text-amber-400">
          ⚠️ Mappa il campo chiave <strong>{keyField}</strong> per poter eseguire l&apos;import
        </p>
      )}

      <div className="flex gap-3">
        <button onClick={onBack}
          className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors">
          ← Indietro
        </button>
        <button onClick={onNext} disabled={!hasKey}
          className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium">
          Anteprima →
        </button>
      </div>
    </div>
  )
}
