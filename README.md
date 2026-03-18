2# HR Platform - Sole 24 Ore

Piattaforma avanzata per la gestione delle Risorse Umane, visualizzazione dell'Organigramma e analisi dei dati (Timesheet, TNS, ecc.).

## Tecnologie Principali

- **Framework:** [Next.js](https://nextjs.org/) (App Router, React 19)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Gestione Stato:** [Zustand](https://github.com/pmndrs/zustand)
- **Database:** [SQLite](https://sqlite.org/) via `better-sqlite3` per persistenza dati veloce e leggera
- **Motore a Grafo / Diagrammi:** [@xyflow/react](https://reactflow.dev/) (precedentemente React Flow) per gli organigrammi interattivi
- **Visualizzazione Dati:** [Recharts](https://recharts.org/) per viste alternative (es. Treemap)
- **Agenti AI & OCR:** Integrazione con `@anthropic-ai/sdk` e `openai` per funzionalità avanzate, oltre a parsing di PDF (`pdf-parse`) e Word (`mammoth`).
- **Tabelle Avanzate:** [AG Grid](https://www.ag-grid.com/) per data cleaning e grid management
- **UI Components:** [Radix UI](https://www.radix-ui.com/) & [Lucide Icons](https://lucide.dev/)

## Caratteristiche Chiave (Features)

*   **Organigramma Interattivo:** Vista a grafo gerarchico fluido (React Flow) delle direzioni aziendali, dipartimenti e posizioni. Supporta espansione/compressione dei rami, drag-and-drop per i cambi di riporto manageriale e zoom/panning.
*   **Treemap Hierarchy:** Modulo alternativo per l'esplorazione del "peso" dimensionale dei vari dipartimenti a colpo d'occhio.
*   **Gestione Drag-and-Drop (DND):** Interfacce per assegnare le risorse umane sprovviste di ruolo ai vari nodi dell'albero tramite DND.
*   **Importazione Dati Evoluta:** Mappatura automatica strutturale dei file Excel/CSV, gestione Storico e "Data Cleaning" interattivo.
*   **Sistema Notifiche & Alert Intelligenti:** Segnalazioni all'utente ("Vista Complessa") in caso di iper-espansione o illeggibilità dei dati sulla tela grafica.

## Configurazione e Avvio Locale

### Requisiti
- Node.js versione 20.x o superiore
- NPM installato

### Installazione
```bash
# Installa le dipendenze
npm install
```

### Avvio Server di Sviluppo
```bash
# Lancia il server Next.js (hot-reloading in ascolto sulla porta standard :3000)
npm run dev
```
Accedi all'applicazione visitando `http://localhost:3000` nel browser.

### Build per la Produzione
```bash
npm run build
npm run start
```

## Architettura Dati

- Il DB SQLite viene gestito in locale (nella root del progetto). I dati importati (Excel, CSV) passano tramite route API (`app/api/`) e vengono trasformati e ripuliti tramite `lib/api.ts` e le tabelle esposte tramite `ag-grid`.
- Gli _store_ di `zustand` (`store/useHRStore.ts`) gestiscono centralmente in modo reattivo lo stato (Nodi, Persone non assegnate, Filtri e Impostazioni della Canvas).

## Note

*   **Gestione Nodi Visivi:** Se i nodi presentano problemi o la struttura diventa troppo ampia in orizzontale, la logica di layout si occupa di compattare alcuni alberi verticalmente (configurabile in `lib/orgchart-layout.ts`).
