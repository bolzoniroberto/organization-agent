# Import dati — regole

## Ordine import (rispettare le FK)
1. `persone`
2. `nodi_organigramma`
3. `supervisioni_timesheet`
4. `ruoli_tns`

## Principi
- Idempotente: `INSERT OR REPLACE` / `ON CONFLICT DO UPDATE`
- CF = chiave di join tra file — mai il nome
- Anomalie → `import_anomalie` — NON bloccare l'import
- Log ogni anomalia con: file_source, riga, tipo, dettaglio

## Tipi di anomalia
- `CF_MANCANTE` — riga senza codice fiscale
- `CF_SCONOSCIUTO` — CF non trovato in `persone`
- `FTE_INCOERENTE` — FTE != 0 ma cf_persona NULL (o viceversa)
- `PADRE_MANCANTE` — reports_to riferisce ID inesistente

## File sorgente

| File | Pattern nome | Frequenza |
|---|---|---|
| Anagrafico puntuali | `*_puntuali-con-filtri*.xlsx` | Mensile |
| Retribuzione mensile | `AR_PAY_014_Retribuzione_Mensile_*.xls` | Mensile |
| Organigramma | `*_Organigramma-per-importazione*.xlsx` | Ad hoc |
