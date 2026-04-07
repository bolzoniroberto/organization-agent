import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { AgentNotification } from '@/types'

// GET /api/agents/notifications — list notifications (optionally filter by status)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')  // 'unread' | 'read' | 'all'
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)

  let sql = `SELECT * FROM agent_notifications`
  const params: unknown[] = []

  if (status && status !== 'all') {
    sql += ` WHERE status = ?`
    params.push(status)
  } else {
    sql += ` WHERE status IN ('unread', 'read')`
  }

  sql += ` ORDER BY
    CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 WHEN 'info' THEN 2 WHEN 'suggestion' THEN 3 END,
    created_at DESC
    LIMIT ?`
  params.push(limit)

  const rows = db().prepare(sql).all(...params) as AgentNotification[]

  // Count unread
  const unreadCount = (db().prepare(`SELECT COUNT(*) as c FROM agent_notifications WHERE status = 'unread'`).get() as { c: number }).c

  return NextResponse.json({ notifications: rows, unreadCount })
}

// POST /api/agents/notifications — update notification status
export async function POST(req: Request) {
  const body = await req.json() as { id: string; action: 'read' | 'dismiss' | 'dismiss_all' }

  if (body.action === 'dismiss_all') {
    db().prepare(`UPDATE agent_notifications SET status = 'dismissed' WHERE status IN ('unread', 'read')`).run()
    return NextResponse.json({ success: true })
  }

  if (!body.id) {
    return NextResponse.json({ error: 'Missing notification id' }, { status: 400 })
  }

  if (body.action === 'read') {
    db().prepare(`UPDATE agent_notifications SET status = 'read' WHERE id = ? AND status = 'unread'`).run(body.id)
  } else if (body.action === 'dismiss') {
    db().prepare(`UPDATE agent_notifications SET status = 'dismissed' WHERE id = ?`).run(body.id)
  }

  return NextResponse.json({ success: true })
}
