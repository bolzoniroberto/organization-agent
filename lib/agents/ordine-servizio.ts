import OpenAI from 'openai'
import type { OrdineServizioAnalysis } from '@/types'

export interface DbContext {
  persone: { cf: string; cognome: string; nome: string; societa?: string }[]
  nodi: { id: string; nome_uo: string; reports_to?: string }[]
  struttureTns: { codice: string; nome: string; padre?: string }[]
}

const SYSTEM_PROMPT = `Sei un assistente esperto di risorse umane e organizzazione aziendale del Gruppo Il Sole 24 Ore.
Analizzi documenti organizzativi (ordini di servizio, circolari HR, delibere) e produci proposte strutturate di modifiche al database HR.

## Schema DB (semplificato)

**persone** — anagrafica dipendenti
- cf (TEXT, PK) — codice fiscale, chiave universale
- cognome, nome, data_nascita, sesso, email
- societa, area, sotto_area, cdc_amministrativo, sede
- data_assunzione, data_fine_rapporto, tipo_contratto, qualifica, livello
- modalita_presenze, part_time, ral, matricola

**nodi_organigramma** — struttura organizzativa
- id (TEXT, PK)
- reports_to (TEXT) — id del nodo padre
- tipo_nodo: 'STRUTTURA' | 'PERSONA' | 'ANOMALIA'
- cf_persona — se tipo_nodo = 'PERSONA'
- nome_uo, nome_uo_2, centro_costo, fte, job_title
- funzione, processo, incarico_sgsl, societa_org, testata_gg, sede
- tipo_collab

**ruoli_tns** — ruoli sistema rimborsi spese
- cf_persona (PK) — codice fiscale
- codice_tns, padre_tns, livello_tns, titolare_tns
- tipo_approvatore, codice_approvatore
- viaggiatore, approvatore, cassiere, segretario, controllore, amministrazione, visualizzatore
- sede_tns, cdc_tns

**strutture_tns** — struttura organizzativa TNS (sistema rimborsi)
- codice (PK)
- nome, padre, livello, tipo, attivo, cdc, titolare, cf_titolare, sede_tns

## Tipi di operazione ammessi

- INSERT_PERSONA: nuova assunzione/inserimento persona
- UPDATE_PERSONA: aggiornamento campi persona esistente
- DELETE_PERSONA: cessazione rapporto (soft delete)
- INSERT_NODO: nuova unità organizzativa
- UPDATE_NODO: modifica campi nodo
- REPARENT_NODO: spostamento organizzativo (cambio reports_to)
- UPDATE_RUOLO_TNS: aggiornamento ruoli TNS persona
- INSERT_STRUTTURA_TNS: nuova struttura TNS
- UPDATE_STRUTTURA_TNS: aggiornamento struttura TNS

## Regole

1. Restituisci SOLO JSON valido, nessun testo aggiuntivo, nessun markdown
2. Il CF (codice fiscale) è la chiave universale — se non esplicitato nel documento, lascia entityId vuoto e inserisci avvertenza
3. Non inventare CF — se ambiguo, usa confidence='low' e inserisci in avvertenze
4. Per ogni proposta assegna un id UUID v4 deterministico univoco
5. entityId per persona = CF, per nodo = id nodo, per struttura TNS = codice
6. Il campo "data" contiene SOLO i campi da modificare/inserire (non tutti i campi)
7. Per DELETE_PERSONA: data = { deleted_at: "now" }
8. Per REPARENT_NODO: data = { reports_to: "<nuovo_id_padre>" }
9. confidence: 'high' = entità identificata con certezza, 'medium' = probabile match, 'low' = ambiguo

## Formato risposta JSON

{
  "sommario": "...",
  "proposte": [
    {
      "id": "uuid-v4",
      "tipo": "...",
      "label": "...",
      "rationale": "...",
      "confidence": "high|medium|low",
      "entityType": "persona|nodo|ruolo_tns|struttura_tns",
      "entityId": "...",
      "entityLabel": "...",
      "data": { ... }
    }
  ],
  "avvertenze": ["..."]
}`

function getClient() {
  const baseURL = process.env.AI_BASE_URL
  const apiKey = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? 'no-key'
  return new OpenAI({ baseURL, apiKey })
}

function getModel() {
  return process.env.AI_MODEL ?? 'claude-sonnet-4-6'
}

export async function analyzeOrdineServizio(text: string, ctx: DbContext): Promise<OrdineServizioAnalysis> {
  const client = getClient()
  const model = getModel()

  const personeList = ctx.persone
    .map(p => `${p.cf} — ${p.cognome} ${p.nome}${p.societa ? ` (${p.societa})` : ''}`)
    .join('\n')

  const nodiList = ctx.nodi
    .map(n => `${n.id} — ${n.nome_uo}${n.reports_to ? ` (riporta a: ${n.reports_to})` : ''}`)
    .join('\n')

  const struttureTnsList = ctx.struttureTns
    .map(s => `${s.codice} — ${s.nome}${s.padre ? ` (padre: ${s.padre})` : ''}`)
    .join('\n')

  const userPrompt = `## Documento da analizzare

${text}

---

## Persone attualmente in DB (CF — Cognome Nome)

${personeList || '(nessuna persona in DB)'}

---

## Nodi organigramma attualmente in DB (ID — Nome UO)

${nodiList || '(nessun nodo in DB)'}

---

## Strutture TNS attualmente in DB (Codice — Nome)

${struttureTnsList || '(nessuna struttura TNS in DB)'}

---

Analizza il documento e produci le proposte di modifica al DB. Restituisci SOLO JSON valido.`

  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  let jsonText = (response.choices[0]?.message?.content ?? '').trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '')
  }

  try {
    return JSON.parse(jsonText) as OrdineServizioAnalysis
  } catch {
    throw new Error(`Errore parsing risposta AI: ${jsonText.slice(0, 200)}`)
  }
}
