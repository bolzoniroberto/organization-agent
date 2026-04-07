import OpenAI from 'openai'
import { executeQuery, getSchemaInfo, validateQuery } from './tools/query-db'
import type { ChatCompletionMessageParam, ChatCompletionTool, ChatCompletionMessageFunctionToolCall } from 'openai/resources/chat/completions'

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
]

function buildSystemPrompt(): string {
  return `Sei l'assistente AI integrato nella piattaforma HR del Gruppo Il Sole 24 Ore.
Rispondi in italiano. Sei preciso, conciso e utile.

## Cosa puoi fare

1. **Interrogare il database** — Hai accesso in sola lettura a tutte le tabelle HR. Puoi contare persone, filtrare per area/società/sede, analizzare la struttura organizzativa, trovare anomalie.
2. **Analizzare dati** — Puoi calcolare metriche, confrontare aree, individuare pattern.
3. **Spiegare la struttura** — Puoi descrivere l'organigramma, i riporti, le unità organizzative.

## Regole

- Usa SEMPRE lo strumento \`get_schema\` prima della PRIMA query se non conosci lo schema
- Scrivi query SQL valide per SQLite
- Non produrre mai operazioni di scrittura (INSERT, UPDATE, DELETE)
- Rispondi in modo chiaro e strutturato con dati precisi
- Se una domanda è ambigua, chiedi chiarimenti
- Usa formattazione Markdown per leggibilità (tabelle, elenchi, grassetto)
- Per i numeri grandi usa il formato italiano (es. 1.234, €38.500)
- Il campo \`cf\` (codice fiscale) è la chiave primaria delle persone
- I nodi organigramma hanno \`reports_to\` che punta al nodo padre
- \`deleted_at IS NULL\` = record attivo

## Tabelle principali

- **persone**: anagrafica dipendenti (cf, cognome, nome, società, area, sede, qualifica, RAL, etc.)
- **nodi_organigramma**: struttura org (id, reports_to, tipo_nodo, nome_uo, cf_persona)
- **strutture_tns**: struttura rimborsi spese
- **change_log**: storico modifiche
- **agent_notifications**: notifiche generate dagli agenti`
}

export async function chatWithAgent(
  messages: ChatMessage[],
  userMessage: string
): Promise<{ response: string; toolCalls?: { name: string; input: string; output: string }[] }> {
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
        if (String(err).includes('429') && attempt < 3) {
          await new Promise(r => setTimeout(r, 15000 * attempt))
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
  }
}
