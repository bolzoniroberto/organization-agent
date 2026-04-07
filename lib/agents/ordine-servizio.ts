import OpenAI from 'openai'
import type { OrdineServizioAnalysis } from '@/types'

export interface DbContext {
  persone: { cf: string; cognome: string; nome: string; societa?: string }[]
  nodi: { id: string; nome_uo: string; reports_to?: string }[]
  struttureTns: { codice: string; nome: string; padre?: string }[]
}

// Compact prompt for short/simple requests (< 500 chars). Minimal schema, only relevant tables.
const SYSTEM_PROMPT_COMPACT = `Sei un assistente HR. Leggi il testo e produci SOLO JSON valido (niente markdown).

Tabelle DB:
- persone: cf(PK), cognome, nome, societa, area, sede, qualifica, livello, email, data_assunzione, data_fine_rapporto
- nodi_organigramma: id(PK), reports_to, tipo_nodo, cf_persona, nome_uo
- ruoli_tns: cf_persona(PK), approvatore, viaggiatore, cassiere, segretario, controllore, visualizzatore, codice_tns, padre_tns, livello_tns, sede_tns, cdc_tns
- strutture_tns: codice(PK), nome, padre, livello, titolare, cf_titolare

Tipi operazione: INSERT_PERSONA, UPDATE_PERSONA, DELETE_PERSONA, INSERT_NODO, UPDATE_NODO, REPARENT_NODO, UPDATE_RUOLO_TNS, INSERT_STRUTTURA_TNS, UPDATE_STRUTTURA_TNS

Regole: entityId=CF per persone/ruoli_tns; "data" contiene SOLO i campi da modificare; se CF non noto lascia entityId vuoto e aggiungi avvertenza; confidence: high/medium/low.

Rispondi SOLO con: {"sommario":"...","proposte":[{"id":"uuid","tipo":"...","label":"...","rationale":"...","confidence":"...","entityType":"...","entityId":"...","entityLabel":"...","data":{...}}],"avvertenze":[]}`

// Full prompt for documents / long texts
const SYSTEM_PROMPT_FULL = `Sei un assistente HR per il Gruppo Il Sole 24 Ore. Analizzi documenti e produci proposte di modifica DB. Rispondi SOLO con JSON valido, niente markdown.

Tabelle:
- persone: cf(PK), cognome, nome, data_nascita, sesso, email, societa, area, sotto_area, cdc_amministrativo, sede, data_assunzione, data_fine_rapporto, tipo_contratto, qualifica, livello, modalita_presenze, part_time, ral, matricola
- nodi_organigramma: id(PK), reports_to, tipo_nodo(STRUTTURA|PERSONA|ANOMALIA), cf_persona, nome_uo, nome_uo_2, centro_costo, fte, job_title, funzione, processo, societa_org, testata_gg, sede
- ruoli_tns: cf_persona(PK), codice_tns, padre_tns, livello_tns, titolare_tns, tipo_approvatore, codice_approvatore, viaggiatore, approvatore, cassiere, segretario, controllore, amministrazione, visualizzatore, sede_tns, cdc_tns
- strutture_tns: codice(PK), nome, padre, livello, tipo, attivo, cdc, titolare, cf_titolare, sede_tns

Operazioni: INSERT_PERSONA, UPDATE_PERSONA, DELETE_PERSONA(data={deleted_at:"now"}), INSERT_NODO, UPDATE_NODO, REPARENT_NODO(data={reports_to:"..."}), UPDATE_RUOLO_TNS, INSERT_STRUTTURA_TNS, UPDATE_STRUTTURA_TNS

Regole: CF=chiave universale; entityId=CF per persone/ruoli; "data"=solo campi da modificare; non inventare CF; confidence=high/medium/low.

Formato: {"sommario":"...","proposte":[{"id":"uuid","tipo":"...","label":"...","rationale":"...","confidence":"...","entityType":"...","entityId":"...","entityLabel":"...","data":{}}],"avvertenze":[]}`

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

  const isShort = text.length < 500

  // Build context block only for long texts (documents)
  let contextBlock = ''
  if (!isShort) {
    const persone = ctx.persone.slice(0, 200)
      .map(p => `${p.cf} — ${p.cognome} ${p.nome}`)
      .join('\n')
    const nodi = ctx.nodi.slice(0, 100)
      .map(n => `${n.id} — ${n.nome_uo}`)
      .join('\n')
    contextBlock = persone || nodi
      ? `\nContesto DB:\n${persone ? `Persone:\n${persone}\n` : ''}${nodi ? `Nodi:\n${nodi}` : ''}`
      : ''
  } else if (ctx.persone.length > 0) {
    // Short prompt: only pass the matched person(s)
    const matched = ctx.persone.map(p => `${p.cf} — ${p.cognome} ${p.nome}`).join('\n')
    contextBlock = `\nPersone trovate in DB:\n${matched}`
  }

  const systemPrompt = isShort ? SYSTEM_PROMPT_COMPACT : SYSTEM_PROMPT_FULL
  const userPrompt = `${text}${contextBlock}`

  const callWithRetry = async (retries = 3, delayMs = 12000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await client.chat.completions.create({
          model,
          max_tokens: isShort ? 1024 : 4096,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        })
      } catch (err) {
        const msg = String(err)
        if ((msg.includes('429') || msg.includes('503')) && attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * attempt))
          continue
        }
        throw err
      }
    }
    throw new Error('Max retry reached')
  }

  const response = await callWithRetry()

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
