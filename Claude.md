# HR Platform Sole 24 Ore — CLAUDE.md

## Visione
Piattaforma intelligente per la gestione dell'organizzazione del Gruppo Il Sole 24 Ore.
Gli agenti AI arricchiscono i dati, rilevano anomalie e suggeriscono variazioni organizzative.
L'utente governa l'org tramite viste formali ricche e flussi approvativi integrati.

## Ruolo
Senior full-stack developer. Stack: Next.js 15 App Router · SQLite (better-sqlite3) ·
AG Grid · React Flow · Zustand · Radix UI + TailwindCSS 4 · AI model TBD (model-agnostico).
Hai già lavorato su `tns-orgplus-web` (stesso gruppo) — conosci logica e pattern.

---

## ⚠️ Regole assolute

- `npm` sempre, mai `bun`
- DB SOLO in API routes — mai nel client
- NON riscrivere `lib/db/init.ts` da zero — migrazioni idempotenti
- NON toccare `extra_data` senza verificare che non sia già stringa JSON
- NON fare `JSON.stringify(extra_data)` lato server senza verifica previa
- Chiama SEMPRE `writeChangeLog` in ogni route che modifica dati
- File protetti: `hrplatform.db` · `.env` · `lib/db/init.ts` · `public/fonts/`
- TRE GERARCHIE sempre separate — no JOIN tra sistemi senza esplicitarlo
- CF (codice fiscale) = chiave universale — mai ID autoincrement come join key
- Agenti AI NON scrivono mai direttamente sul DB — passano da API routes
- Suggerimenti agenti SEMPRE presentati all'utente prima dell'applicazione

---

## Struttura cartelle

```
app/api/
  persone/      # CRUD anagrafica
  org/          # CRUD nodi_organigramma
  timesheet/    # supervisioni_timesheet
  tns/          # ruoli_tns (logica da tns-orgplus-web)
  import/       # import Excel
  agents/       # endpoint agenti AI
  changelog/
components/
  layout/       # Shell, navbar, tabs
  views/        # OrgChartView, GridView, AccordionView, ImportExportView, StoricoView
  agents/       # UI suggerimenti, pannello arricchimento
  shared/       # Dialog, Drawer, Toast, Badge
lib/
  db/           # init.ts (PROTETTO) — vedi lib/db/CLAUDE.md
  db.ts         # wrapper DB + writeChangeLog
  api.ts        # client fetch wrapper
  agents/       # logica LLM, prompts, parser
store/useHRStore.ts
types/index.ts
public/fonts/   # PROTETTI
docs/           # vedi file specifici sotto
```

---

## Riferimenti — leggi prima di lavorare su questi ambiti

| Ambito | File da leggere |
|---|---|
| DB, schema, migrazioni | `lib/db/CLAUDE.md` |
| Import Excel, anomalie | `docs/import-rules.md` |
| Modello dati, gerarchie | `docs/data-model.md` |
| Feature TNS | `tns-orgplus-web` repo |

---

## UI/UX

- **Dark mode default** con toggle opzionale (classe `dark` su `<html>`)
- **Tab orizzontali in cima**: Organigramma · TNS · Timesheet · Anagrafica · Import · Agenti · Storico
- Ogni tab può avere sotto-tab per viste diverse
- Stato tab attivo in Zustand (`useHRStore`)
- Stile: identico a `tns-orgplus-web` — Radix UI, minimal enterprise, data-dense
- **Desktop-first**: orgchart e grid non sono mobile-friendly per design
- Su schermi < 768px: banner "Usa un dispositivo desktop"

---

## Efficienza token

- Conciso e diretto — niente spiegazioni ovvie
- NON riscrivere file interi per modifiche parziali: `// ... resto invariato`
- NON aggiungere commenti se non richiesti
- Se ovvio, implementa direttamente

---

## Gestione dubbi

Fai TUTTE le domande in un'unica lista numerata (max 10) prima di scrivere codice.
Chiedi SEMPRE se non sai: quale gerarchia · STRUTTURA o PERSONA · UI/API/agente ·
soft delete / changelog · extra_data vs colonna nativa · quale TabView · fonte dati.
