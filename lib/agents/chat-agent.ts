import OpenAI from 'openai'
import { executeQuery, getSchemaInfo, validateQuery } from './tools/query-db'
import { db } from '@/lib/db'
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions'
import type { OrdineServizioProposal } from '@/types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: string | null
  created_at?: string
}

function getClient() {
  const baseURL = process.env.AI_BASE_URL
  const apiKey = process.env.AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? 'no-key'
  return new OpenAI({ baseURL, apiKey })
}

function getModel() {
  return process.env.AI_MODEL ?? 'claude-sonnet-4-6'
}

const TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description: `Esegue una query SELECT di sola lettura sul database HR. Usa questa funzione per recuperare dati, conteggi, aggregazioni e analisi. Le query devono essere SQLite-compatibili. Massimo 50 righe di output.`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'Query SQL SELECT valida. Non usare INSERT/UPDATE/DELETE.',
          },
          description: {
            type: 'string',
            description: 'Breve descrizione di cosa sta cercando la query.',
          },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_schema',
      description: 'Restituisce lo schema completo del database HR con tutte le tabelle e colonne. Usa questo strumento PRIMA di scrivere query se non sei sicuro delle colonne disponibili.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_record',
      description: 'Recupera il record attuale di una persona, nodo organigramma o struttura TNS. Usalo PRIMA di propose_changes per ottenere i valori correnti da includere nel before/after.',
      parameters: {
        type: 'object',
        properties: {
          entity_type: {
            type: 'string',
            enum: ['persona', 'nodo', 'struttura_tns'],
            description: 'Tipo di entità da recuperare',
          },
          entity_id: {
            type: 'string',
            description: 'CF per persona, ID nodo per nodo, codice per struttura_tns',
          },
        },
        required: ['entity_type', 'entity_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_changes',
      description: 'Genera proposte strutturate di modifica al database. Chiama questo strumento quando hai analizzato la situazione e vuoi proporre modifiche concrete all\'utente. Le proposte saranno mostrate all\'utente per approvazione prima di qualsiasi scrittura.',
      parameters: {
        type: 'object',
        properties: {
          proposals: {
            type: 'array',
            description: 'Array di proposte di modifica',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'UUID univoco per la proposta' },
                tipo: {
                  type: 'string',
                  enum: ['INSERT_PERSONA', 'UPDATE_PERSONA', 'DELETE_PERSONA', 'INSERT_NODO', 'UPDATE_NODO', 'REPARENT_NODO', 'UPDATE_RUOLO_TNS', 'INSERT_STRUTTURA_TNS', 'UPDATE_STRUTTURA_TNS'],
                },
                label: { type: 'string', description: 'Descrizione breve per l\'utente' },
                rationale: { type: 'string', description: 'Motivazione della modifica' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                entityType: { type: 'string', enum: ['persona', 'nodo', 'ruolo_tns', 'struttura_tns'] },
                entityId: { type: 'string' },
                entityLabel: { type: 'string' },
                data: { type: 'object', description: 'Campi da modificare (solo quelli che cambiano)' },
                currentValues: { type: 'object', description: 'Valori attuali del record (ottenuti con get_record)' },
              },
              required: ['id', 'tipo', 'label', 'rationale', 'confidence', 'entityType', 'data'],
            },
          },
        },
        required: ['proposals'],
      },
    },
  },
]

function buildSystemPrompt(): string {
  return `Sei l'assistente AI integrato nella piattaforma HR del Gruppo Il Sole 24 Ore.
Rispondi in italiano. Sei preciso, conciso e utile.

## Cosa puoi fare

1. **Interrogare il database** — Hai accesso in sola lettura a tutte le tabelle HR.
2. **Proporre modifiche** — Quando l'utente descrive un problema, puoi generare proposte strutturate che l'utente approverà prima dell'esecuzione.
3. **Analisi efficienza** — Puoi individuare anomalie organizzative e problemi di qualità dei dati.

## Flusso per generare proposte

Quando l'utente descrive un problema che richiede modifiche al DB:
1. Usa \`query_database\` per trovare i record coinvolti
2. Usa \`get_record\` per ottenere i valori attuali di ogni record da modificare
3. Usa \`propose_changes\` con le proposte complete (inclusi currentValues)
4. Scrivi una risposta testuale che spiega cosa hai proposto

## Analisi efficienza (quando l'utente chiede "analizza", "efficienza", "anomalie" o simili)

Esegui queste query e proponi fix per i problemi trovati:
- Posizioni senza persona: \`SELECT id, nome_uo FROM nodi_organigramma WHERE cf_persona IS NULL AND deleted_at IS NULL AND tipo_nodo='STRUTTURA' LIMIT 20\`
- Span of control eccessivo: \`SELECT reports_to, COUNT(*) as n FROM nodi_organigramma WHERE deleted_at IS NULL GROUP BY reports_to HAVING n > 10 LIMIT 20\`
- Persone senza nodo: \`SELECT p.cf, p.cognome, p.nome FROM persone p LEFT JOIN nodi_organigramma n ON n.cf_persona=p.cf AND n.deleted_at IS NULL WHERE p.deleted_at IS NULL AND n.id IS NULL LIMIT 20\`
- Contratti scaduti non chiusi: \`SELECT cf, cognome, nome, data_fine_rapporto FROM persone WHERE data_fine_rapporto < date('now') AND deleted_at IS NULL LIMIT 20\`

## Regole

- Usa \`get_schema\` prima della prima query se non conosci lo schema
- \`deleted_at IS NULL\` = record attivo
- CF = chiave primaria persone; proposals entityId = CF per persona/ruolo_tns
- Non inventare CF — se non lo conosci lascia entityId vuoto e confidence='low'
- Usa Markdown per le risposte testuali (tabelle, elenchi, grassetto)

## Tabelle principali

- **persone**: cf(PK), cognome, nome, societa, area, sede, qualifica, data_assunzione, data_fine_rapporto, deleted_at
- **nodi_organigramma**: id(PK), reports_to, tipo_nodo(STRUTTURA|PERSONA|ANOMALIA), cf_persona, nome_uo, centro_costo, deleted_at
- **strutture_tns**: codice(PK), nome, padre, livello, attivo
- **change_log**: storico modifiche
- **agent_notifications**: notifiche agenti`
}

export async function chatWithAgent(
  messages: ChatMessage[],
  userMessage: string
): Promise<{ response: string; toolCalls?: { name: string; input: string; output: string }[]; proposals?: OrdineServizioProposal[] }> {
  const client = getClient()
  const model = getModel()

  // Build message history
  const chatMessages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt() },
  ]

  // Add last 20 messages of history for context
  const recentHistory = messages.slice(-20)
  for (const msg of recentHistory) {
    chatMessages.push({
      role: msg.role,
      content: msg.content,
    })
  }

  chatMessages.push({ role: 'user', content: userMessage })

  const toolCallsLog: { name: string; input: string; output: string }[] = []
  let extractedProposals: OrdineServizioProposal[] | undefined

  const callAI = async (msgs: typeof chatMessages) => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await client.chat.completions.create({
          model,
          max_tokens: 4096,
          messages: msgs,
          tools: TOOLS,
          tool_choice: 'auto',
        })
      } catch (err) {
        const msg = String(err)
        if ((msg.includes('429') || msg.includes('503')) && attempt < 3) {
          await new Promise(r => setTimeout(r, 12000 * attempt))
          continue
        }
        throw err
      }
    }
    throw new Error('Max retry reached')
  }

  // Tool-calling loop (max 5 rounds)
  for (let round = 0; round < 5; round++) {
    const response = await callAI(chatMessages)

    const choice = response.choices[0]
    if (!choice) throw new Error('Nessuna risposta dal modello AI')

    const message = choice.message

    // If no tool calls, return the text response
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        response: message.content ?? '',
        toolCalls: toolCallsLog.length > 0 ? toolCallsLog : undefined,
        proposals: extractedProposals,
      }
    }

    // Add assistant message with tool calls
    chatMessages.push({
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls,
    } as ChatCompletionMessageParam)

    // Execute each tool call
    for (const tc of message.tool_calls as ChatCompletionMessageFunctionToolCall[]) {
      let result: string

      try {
        const args = JSON.parse(tc.function.arguments || '{}')

        if (tc.function.name === 'query_database') {
          const validation = validateQuery(args.sql)
          if (!validation.valid) {
            result = JSON.stringify({ error: validation.error })
          } else {
            const qr = executeQuery(args.sql)
            result = JSON.stringify({
              columns: qr.columns,
              rows: qr.rows,
              rowCount: qr.rowCount,
              truncated: qr.truncated,
            })
          }
        } else if (tc.function.name === 'get_schema') {
          result = getSchemaInfo()
        } else if (tc.function.name === 'get_record') {
          try {
            const { entity_type, entity_id } = args
            let row: unknown = null
            if (entity_type === 'persona') {
              row = db().prepare('SELECT * FROM persone WHERE cf = ?').get(entity_id)
            } else if (entity_type === 'nodo') {
              row = db().prepare('SELECT * FROM nodi_organigramma WHERE id = ?').get(entity_id)
            } else if (entity_type === 'struttura_tns') {
              row = db().prepare('SELECT * FROM strutture_tns WHERE codice = ?').get(entity_id)
            }
            result = row ? JSON.stringify(row) : JSON.stringify({ error: 'Record non trovato' })
          } catch (e) {
            result = JSON.stringify({ error: String(e) })
          }
        } else if (tc.function.name === 'propose_changes') {
          // Intercept proposals — don't re-send to AI, just acknowledge
          try {
            extractedProposals = args.proposals as OrdineServizioProposal[]
            result = JSON.stringify({ status: 'ok', count: extractedProposals?.length ?? 0 })
          } catch (e) {
            result = JSON.stringify({ error: String(e) })
          }
        } else {
          result = JSON.stringify({ error: `Strumento sconosciuto: ${tc.function.name}` })
        }
      } catch (err) {
        result = JSON.stringify({ error: String(err) })
      }

      toolCallsLog.push({
        name: tc.function.name,
        input: tc.function.arguments || '',
        output: result.length > 2000 ? result.slice(0, 2000) + '...(troncato)' : result,
      })

      chatMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: result,
      } as ChatCompletionMessageParam)
    }
  }

  // If we exhausted rounds, return the last content
  return {
    response: 'Ho raggiunto il limite di iterazioni. Prova a riformulare la domanda in modo più specifico.',
    toolCalls: toolCallsLog,
    proposals: extractedProposals,
  }
}
