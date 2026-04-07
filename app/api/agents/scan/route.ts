import { NextResponse } from 'next/server'
import { runWatchdogScan } from '@/lib/agents/watchdog'

// POST /api/agents/scan — trigger a watchdog scan
export async function POST() {
  try {
    const result = runWatchdogScan()
    return NextResponse.json({
      success: true,
      created: result.created,
      total: result.total,
      message: result.created > 0
        ? `Scansione completata: ${result.created} nuove notifiche generate (${result.total} attive totali)`
        : `Scansione completata: nessuna nuova anomalia rilevata (${result.total} attive totali)`,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
