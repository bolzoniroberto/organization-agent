# lib/db — Schema e pattern DB

## File protetti
- `init.ts` — NON riscrivere da zero. Aggiungi solo nuovi blocchi `CREATE TABLE IF NOT EXISTS`
  o `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in fondo.

## Tabelle

### persone
Chiave: `cf VARCHAR(16) PRIMARY KEY` — codice fiscale, chiave universale.
Contiene: cognome, nome, data_nascita, sesso, email, societa, area, sotto_area,
cdc_amministrativo, sede, data_assunzione, data_fine_rapporto, tipo_contratto,
qualifica, livello, modalita_presenze (F/T/E), part_time, ral, extra_data TEXT (JSON),
deleted_at DATETIME, ultimo_aggiornamento TIMESTAMP.

### nodi_organigramma
Chiave: `id VARCHAR(200) PRIMARY KEY` — stringa simbolica o CF+suffisso.
Albero ricorsivo: `reports_to VARCHAR(200) REFERENCES nodi_organigramma(id)`.
tipo_nodo: STRUTTURA | PERSONA | ANOMALIA.
cf_persona: NULL se STRUTTURA, CF valido se PERSONA.
Campi: nome_uo, nome_uo_2, centro_costo, fte, job_title, funzione, processo,
incarico_sgsl, societa_org, testata_gg, sede, tipo_collab, note_uo,
extra_data TEXT (JSON), deleted_at DATETIME.

### supervisioni_timesheet
Chiave: `cf_dipendente VARCHAR(16) PRIMARY KEY`.
Flat: un supervisore per dipendente.
Campi: cf_supervisore, data_inizio DATE, data_fine DATE (NULL = attivo).

### ruoli_tns
Chiave: `cf_persona VARCHAR(16) PRIMARY KEY`.
Campi: codice_tns, padre_tns, livello_tns, titolare_tns, tipo_approvatore,
codice_approvatore, viaggiatore, approvatore, cassiere, segretario, controllore,
amministrazione, visualizzatore, escluso_tns, sede_tns.

### import_anomalie
id auto, import_ts, file_source, riga INTEGER, tipo VARCHAR(50), dettaglio TEXT.

### change_log
id auto, timestamp, entity_type, entity_id, entity_label, action, field_name, old_value, new_value.

## Soft delete
- `deleted_at DATETIME` (NULL = attivo) su: persone, nodi_organigramma
- Tutte le query di lista: `WHERE deleted_at IS NULL`
- DELETE → `SET deleted_at = CURRENT_TIMESTAMP`
- RESTORE → `SET deleted_at = NULL`
- `?showDeleted=true` per includere cancellati

## writeChangeLog — firma obbligatoria

```typescript
writeChangeLog(
  entityType: string,         // 'persona'|'nodo_org'|'supervisione'|'ruolo_tns'
  entityId: string,           // CF o id univoco
  entityLabel: string | null,
  action: 'CREATE'|'UPDATE'|'DELETE'|'RESTORE'|'IMPORT'|'AGENT_SUGGEST',
  fieldName: string | null,   // null per CREATE/DELETE/IMPORT
  oldValue: string | null,
  newValue: string | null
): void
```

Per UPDATE: una chiamata per ogni campo che cambia valore.
Per modifiche da agente approvate dall'utente: action = `'AGENT_SUGGEST'`.

## extra_data
- Leggere SEMPRE: `JSON.parse(row.extra_data ?? '{}')`
- MAI stringify senza verifica previa
- MAI usare in JOIN, filtri, o come chiave
