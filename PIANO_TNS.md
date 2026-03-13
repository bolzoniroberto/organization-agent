# Piano: Port funzionalità TNS → Organization Agent

## Contesto

tns-orgplus-web è una piattaforma standalone con tutto il dominio TNS (strutture, dipendenti, accordion, orgchart, orfani, import XLS). Organization Agent ha già l'infrastruttura tecnica equivalente (Next.js, AG Grid, React Flow, Zustand, dnd-kit) e tabelle parziali (`strutture_tns`, `ruoli_tns`). L'obiettivo è portare tutte le funzionalità TNS in Organization Agent senza migrare dati (i dati verranno reimportati via XLS) e usando il modello dati esteso (strutture_tns con tutti i campi ruolo, stesso formato XLS "DB_TNS").

## Decisioni chiave
- **No migrazione dati**: solo codice, i dati rientreranno via import XLS
- **strutture_tns estesa**: aggiungere tutti i campi da `strutture` in tns-orgplus
- **XLS**: stessa logica e stesso formato di tns-orgplus (sheet "DB_TNS", 26 colonne)
- **Persone TNS**: la relazione struttura↔persona avviene via `ruoli_tns.codice_tns = strutture_tns.codice`

---

## FASE 1 — Schema DB: estendi strutture_tns

**File:** `Organization Agent/lib/db/init.ts`

Aggiungere idempotentemente (via `ALTER TABLE IF NOT`) i campi mancanti a `strutture_tns`:

```
cdc_costo, titolare, unita_organizzativa, ruoli_oltre_v, ruoli,
viaggiatore, segr_redaz, approvatore, cassiere, visualizzatori,
segretario, controllore, amministrazione, segr_red_assistita,
segretario_assistito, controllore_assistito, ruoli_afc, ruoli_hr,
altri_ruoli, sede_tns, gruppo_sind,
deleted_at DATETIME,           ← soft delete
extra_data TEXT DEFAULT '{}'   ← custom fields (se non già presente)
```

**Riferimento schema:** `tns-orgplus-web/lib/db/init.ts` (tabella strutture)

Verificare che `ruoli_tns` abbia già tutti i campi persona TNS — da quel file risulta che li ha quasi tutti (inclusi i recenti aggiornamenti sync); verificare `segr_redaz`, `segreteria_red_asst`, `segretario_asst`, `controllore_asst`, `ruoli_afc`, `ruoli_hr`, `altri_ruoli`, `gruppo_sind`.

---

## FASE 2 — API Routes: CRUD completo per strutture_tns

**File da creare/modificare in** `Organization Agent/app/api/strutture-tns/`:

| Endpoint | Metodo | Note |
|---|---|---|
| `/api/strutture-tns` | GET | aggiungere `showDeleted`, conteggio persone per struttura |
| `/api/strutture-tns` | POST | validazione codice unico, writeChangeLog |
| `/api/strutture-tns/[codice]` | GET, PUT, DELETE | PUT con diff tracking; DELETE = soft delete |
| `/api/strutture-tns/[codice]/restore` | POST | clear `deleted_at` |
| `/api/strutture-tns/[codice]/parent` | POST | aggiorna campo `padre` |
| `/api/strutture-tns/[codice]/persone` | GET | persone in struttura via `ruoli_tns.codice_tns = codice` |
| `/api/strutture-tns/check-codice` | GET | verifica disponibilità codice |
| `/api/strutture-tns/suggest-codice` | GET | suggerisce prossimo codice figlio |

**Riferimento:** `tns-orgplus-web/app/api/strutture/` (logica identica, adattata per strutture_tns + ruoli_tns)

Ogni route che modifica dati chiama `writeChangeLog()` dal `lib/db.ts` esistente.

---

## FASE 3 — API Routes: CRUD completo per ruoli_tns (persone TNS)

**File:** `Organization Agent/app/api/tns/`

Verificare/estendere con:
- GET lista con `showDeleted` (basato su `persone.deleted_at`)
- PUT per update campi TNS con diff tracking e changeLog
- Endpoint per assegnare/spostare persona tra strutture (`codice_tns` update)
- Rimozione dalla struttura (set `codice_tns = null`)

---

## FASE 4 — AccordionTnsView: upgrade completo

**File:** `Organization Agent/components/views/AccordionTnsView.tsx`

Portare da `tns-orgplus-web/components/views/AccordionView.tsx` (907 righe):

1. **buildTree()** — costruisce albero gerarchico da `strutture_tns` (codice/padre) con persone annidate da `ruoli_tns`
2. **DnD con dnd-kit** — `DraggableStruttura`, `DroppableStruttura`, `DraggablePersona`
   - Drag struttura → cambia `padre` via `/api/strutture-tns/[codice]/parent`
   - Drag persona → cambia `codice_tns` via `/api/tns/[cf]`
   - ConfirmDialog prima di ogni move
3. **Colorazione strutture** (modalità "dipendenti"):
   - Verde: struttura con persone dirette
   - Giallo/ambra: solo persone indirette (nei figli)
   - Grigio opaco: nessuna persona nel subtree
4. **Filtri/Search**: ricerca per codice/nome, filtro `sede_tns`, toggle "nascondi senza persone"
5. **UnassignedPanel**: persone in `ruoli_tns` con `codice_tns` null o codice non esistente in strutture_tns
6. **MoveEmployeePanel**: cerca e sposta persone tra strutture
7. **RecordDrawer** per edit struttura_tns e ruoli_tns (riutilizzare `shared/RecordDrawer.tsx` se esiste, altrimenti portare da tns-orgplus)
8. **Toggle showDeleted** per vedere strutture cancellate (soft delete)

**Viste compact e con azioni**: edit, delete, restore per ogni struttura; edit, riassegna, remove per ogni persona.

---

## FASE 5 — Orphan detection in AnagraficaView (tab TNS)

**File:** `Organization Agent/components/views/AnagraficaView.tsx`

Aggiungere tab orfani per il dominio TNS (logic da `tns-orgplus-web/components/views/GridView.tsx` linee 309-338):

1. **Orfani Persone TNS**: persone in `ruoli_tns` con `codice_tns` null o non in strutture_tns attive
2. **Orfani Strutture TNS**: strutture con `padre` non null ma padre non presente in strutture_tns
3. **Strutture Vuote**: strutture senza persone nel subtree (DFS ricorsiva su childrenMap)

Badge amber/green, stessa UX delle tab orfani di tns-orgplus. Computazione via `useMemo` con dipendenze `[struttureTns, tns]`.

---

## FASE 6 — TnsCanvas: colorazione e pannello orfani

**File:** `Organization Agent/components/orgchart/TnsCanvas.tsx`

Aggiungere da `tns-orgplus-web/components/views/OrgChartView.tsx`:

1. **Color scheme per nodi**: stesso schema verde/ambra/grigio basato su presenza persone nel subtree
2. **UnassignedPanel** a lato (persone senza struttura TNS)
3. **MovePersonPanel** per spostare persone tra strutture dall'orgchart
4. **Badge titolare e sede_tns** sui nodi

---

## FASE 7 — Import/Export XLS formato DB_TNS

**File nuovi:**
- `Organization Agent/xls/tns-import.ts`
- `Organization Agent/xls/tns-export.ts`

**Portare da:**
- `tns-orgplus-web/xls/import.ts` → adattare per scrivere su `strutture_tns` e `ruoli_tns` (+ `persone` upsert per CF)
- `tns-orgplus-web/xls/export.ts` → leggere da `strutture_tns` JOIN `ruoli_tns` JOIN `persone`

**Logica discriminazione (invariata):**
- CF 16 caratteri → record persona (→ `ruoli_tns` + upsert `persone`)
- Altrimenti → struttura (→ `strutture_tns`)

**Route API:**
- `Organization Agent/app/api/import/tns/route.ts` — POST multipart/form-data
- `Organization Agent/app/api/export/tns/route.ts` — GET download XLS

**Integrare nel ImportBulkView** o creare una tab "Import TNS" nella sezione import esistente.

---

## FASE 8 — Store updates

**File:** `Organization Agent/store/useHRStore.ts`

- `struttureTns` e `tns` già presenti: verificare che `refreshStruttureTns()` e `refreshTns()` supportino `showDeleted`
- Aggiungere computed selector per orfani (o calcolare in componente via useMemo)
- Aggiungere `refreshAll()` che include anche struttureTns e tns se non già presente

---

## File critici da modificare

| File | Tipo modifica |
|---|---|
| `Organization Agent/lib/db/init.ts` | Estensione schema strutture_tns |
| `Organization Agent/app/api/strutture-tns/*` | CRUD completo (8 endpoint) |
| `Organization Agent/app/api/tns/*` | Estensione CRUD |
| `Organization Agent/components/views/AccordionTnsView.tsx` | Riscrittura completa |
| `Organization Agent/components/views/AnagraficaView.tsx` | Tab orfani TNS |
| `Organization Agent/components/orgchart/TnsCanvas.tsx` | Colorazione + pannelli |
| `Organization Agent/store/useHRStore.ts` | showDeleted support |
| `Organization Agent/xls/tns-import.ts` | Nuovo (portato da tns-orgplus) |
| `Organization Agent/xls/tns-export.ts` | Nuovo (portato da tns-orgplus) |
| `Organization Agent/app/api/import/tns/route.ts` | Nuovo |
| `Organization Agent/app/api/export/tns/route.ts` | Nuovo |

## Riferimenti principali da tns-orgplus-web

| Feature | File sorgente |
|---|---|
| AccordionView + DnD | `components/views/AccordionView.tsx` |
| Orphan logic | `components/views/GridView.tsx` L309-338 |
| OrgChart colorization | `components/views/OrgChartView.tsx` |
| UnassignedPanel | `components/orgchart/UnassignedPanel.tsx` |
| MoveEmployeePanel | `components/orgchart/MoveEmployeePanel.tsx` |
| XLS import | `xls/import.ts` |
| XLS export | `xls/export.ts` |
| DB schema strutture | `lib/db/init.ts` |
| writeChangeLog | `lib/db.ts` |

---

## Verifica end-to-end

1. Avviare `npm run dev` in Organization Agent
2. Importare un XLS DB_TNS via nuova route → verificare strutture_tns e ruoli_tns popolati
3. Aprire AccordionTnsView → verificare gerarchia, colorazione, DnD
4. Spostare una persona → verificare cambio in ruoli_tns + entry in change_log
5. Spostare una struttura → verificare cambio `padre` + change_log
6. Soft delete struttura → verificare deleted_at settato, restore funzionante
7. Aprire tab Orfani → verificare identificazione corretta persone/strutture orfane
8. Aprire TnsCanvas → verificare colorazione nodi
9. Export XLS → verificare stesso formato di tns-orgplus

---

## Ordine di esecuzione consigliato

1. → 2 → 3 (schema e API prima, poi UI) → 4 (accordion: cuore del lavoro) → 5 (orfani) → 6 (canvas) → 7 (import/export) → 8 (store)

Le fasi 1-3 sono prerequisiti bloccanti per tutte le altre.
