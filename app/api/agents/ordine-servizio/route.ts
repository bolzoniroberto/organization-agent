import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyzeOrdineServizio } from '@/lib/agents/ordine-servizio'

export async function POST(req: NextRequest) {
  if (!process.env.AI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Nessuna API key configurata (AI_API_KEY o ANTHROPIC_API_KEY)' }, { status: 500 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const prompt = formData.get('prompt') as string | null

    if (!file && !prompt) {
      return NextResponse.json({ error: 'Fornire un file o un prompt testuale' }, { status: 400 })
    }

    let text = ''

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      const buffer = Buffer.from(await file.arrayBuffer())

      if (ext === 'pdf') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
        const parsed = await pdfParse(buffer)
        text = parsed.text

      } else if (ext === 'docx' || ext === 'doc') {
        const mammoth = await import('mammoth')
        const result = await mammoth.extractRawText({ buffer })
        text = result.value

      } else if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') {
        const XLSX = await import('xlsx')
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const lines: string[] = []
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(sheet)
          lines.push(`[Foglio: ${sheetName}]\n${csv}`)
        }
        text = lines.join('\n\n')

      } else if (ext === 'md' || ext === 'txt') {
        text = buffer.toString('utf-8')

      } else {
        return NextResponse.json({ error: `Formato file non supportato: .${ext}` }, { status: 400 })
      }

      if (!text.trim()) {
        return NextResponse.json({ error: 'Il file non contiene testo leggibile' }, { status: 400 })
      }
    } else {
      text = prompt!
    }

    const database = db()

    // Short prompts (< 500 chars, no file) → context-free mode: only schema, no DB rows.
    // The AI uses confidence='low' when it can't resolve a CF — the user fills it in.
    const isShortPrompt = !file && text.length < 500

    let persone: { cf: string; cognome: string; nome: string; societa?: string }[] = []
    let nodi: { id: string; nome_uo: string; reports_to?: string }[] = []
    let struttureTns: { codice: string; nome: string; padre?: string }[] = []

    if (!isShortPrompt) {
      const textWords = [...new Set(
        text.match(/[A-ZÀÈÌÒÙ][a-zàèìòùA-ZÀÈÌÒÙ]{2,}/g) ?? []
      )].map(w => w.toLowerCase())

      const allPersone = database.prepare(
        'SELECT cf, cognome, nome, societa FROM persone WHERE deleted_at IS NULL'
      ).all() as typeof persone

      const matchedPersone = textWords.length > 0
        ? allPersone.filter(p =>
            textWords.some(w => p.cognome?.toLowerCase().includes(w) || p.nome?.toLowerCase().includes(w))
          )
        : []
      persone = matchedPersone.length > 0 ? matchedPersone : allPersone.slice(0, 100)

      const allNodi = database.prepare(
        'SELECT id, nome_uo, reports_to FROM nodi_organigramma WHERE deleted_at IS NULL'
      ).all() as typeof nodi

      const matchedNodi = textWords.length > 0
        ? allNodi.filter(n => textWords.some(w => n.nome_uo?.toLowerCase().includes(w)))
        : []
      nodi = matchedNodi.length > 0 ? matchedNodi : allNodi.slice(0, 80)

      struttureTns = database.prepare(
        'SELECT codice, nome, padre FROM strutture_tns LIMIT 100'
      ).all() as typeof struttureTns
    } else {
      // Short prompt: resolve the person by name directly from DB to get the CF
      const textWords = [...new Set(
        text.match(/[A-ZÀÈÌÒÙ][a-zàèìòùA-ZÀÈÌÒÙ]{2,}/g) ?? []
      )].map(w => w.toLowerCase())

      if (textWords.length > 0) {
        const allPersone = database.prepare(
          'SELECT cf, cognome, nome, societa FROM persone WHERE deleted_at IS NULL'
        ).all() as typeof persone
        persone = allPersone.filter(p =>
          textWords.some(w => p.cognome?.toLowerCase().includes(w) || p.nome?.toLowerCase().includes(w))
        )
      }
    }

    const analysis = await analyzeOrdineServizio(text, { persone, nodi, struttureTns })

    return NextResponse.json(analysis)
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const message = raw.includes('429')
      ? 'Limite richieste API raggiunto (429). Attendi qualche secondo e riprova, oppure controlla la quota del tuo piano Gemini.'
      : raw
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
