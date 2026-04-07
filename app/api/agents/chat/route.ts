import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { chatWithAgent, type ChatMessage } from '@/lib/agents/chat-agent'
import crypto from 'crypto'

// GET /api/agents/chat — list chat history
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  const rows = db().prepare(`
    SELECT * FROM agent_chat_messages 
    ORDER BY created_at ASC 
    LIMIT ?
  `).all(limit) as ChatMessage[]

  return NextResponse.json({ messages: rows })
}

// POST /api/agents/chat — send a message and get AI response
export async function POST(req: Request) {
  const body = await req.json() as { message: string }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: 'Messaggio vuoto' }, { status: 400 })
  }

  // Retrieve chat history
  const history = db().prepare(`
    SELECT * FROM agent_chat_messages
    ORDER BY created_at ASC
    LIMIT 50
  `).all() as ChatMessage[]

  // Save user message
  const userMsgId = crypto.randomUUID()
  db().prepare(`
    INSERT INTO agent_chat_messages (id, role, content) VALUES (?, 'user', ?)
  `).run(userMsgId, body.message.trim())

  try {
    // Call AI agent
    const result = await chatWithAgent(history, body.message.trim())

    // Save assistant response
    const assistantMsgId = crypto.randomUUID()
    const metadata = result.toolCalls ? JSON.stringify({ toolCalls: result.toolCalls }) : null
    db().prepare(`
      INSERT INTO agent_chat_messages (id, role, content, metadata) VALUES (?, 'assistant', ?, ?)
    `).run(assistantMsgId, result.response, metadata)

    return NextResponse.json({
      response: result.response,
      toolCalls: result.toolCalls,
      messageId: assistantMsgId,
    })
  } catch (err) {
    const raw = String(err)
    const errorMsg = raw.includes('429')
      ? '⚠️ Limite richieste API raggiunto (429). Attendi qualche secondo e riprova.'
      : `⚠️ Errore: ${raw}`
    const errorId = crypto.randomUUID()
    db().prepare(`
      INSERT INTO agent_chat_messages (id, role, content, metadata) VALUES (?, 'assistant', ?, ?)
    `).run(errorId, errorMsg, JSON.stringify({ error: true }))

    return NextResponse.json({
      response: errorMsg,
      messageId: errorId,
    })
  }
}

// DELETE /api/agents/chat — clear chat history
export async function DELETE() {
  db().prepare(`DELETE FROM agent_chat_messages`).run()
  return NextResponse.json({ success: true })
}
