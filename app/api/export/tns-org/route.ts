import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import * as XLSX from 'xlsx'

const HEADERS = [
  "Unità Organizzativa", "CDCCOSTO", "TxCodFiscale", "DESCRIZIONE", "Titolare",
  "LIVELLO", "Codice", "UNITA' OPERATIVA PADRE ", "RUOLI OltreV", "RUOLI",
  "Viaggiatore", "Segr_Redaz", "Approvatore", "Cassiere", "Visualizzatori",
  "Segretario", "Controllore", "Amministrazione", "SegreteriA Red. Ass.ta",
  "SegretariO Ass.to", "Controllore Ass.to", "RuoliAFC", "RuoliHR", "AltriRuoli",
  "Sede_TNS", "GruppoSind",
]

type Row = (string | number | null)[]

export async function GET() {
  try {
    const d = db()

    // ── Strutture (non CF-foglia) ─────────────────────────────────────────
    const cfSet = new Set(
      (d.prepare('SELECT cf FROM persone WHERE deleted_at IS NULL').all() as { cf: string }[]).map(r => r.cf)
    )
    const strutture = (d.prepare(`
      SELECT * FROM strutture_tns WHERE deleted_at IS NULL ORDER BY codice
    `).all() as Record<string, string | null>[]).filter(s => s.codice != null && !cfSet.has(s.codice))

    // ── Persone TNS ───────────────────────────────────────────────────────
    const persone = d.prepare(`
      SELECT * FROM persone WHERE deleted_at IS NULL AND codice_tns IS NOT NULL
      ORDER BY cognome, nome
    `).all() as Record<string, string | null>[]

    function strutRow(s: Record<string, string | null>): Row {
      return [
        '',                      // Unità Organizzativa
        s.cdc ?? '',             // CDCCOSTO
        '',                      // TxCodFiscale
        s.nome ?? '',            // DESCRIZIONE
        s.titolare ?? '',        // Titolare
        s.livello ?? '',         // LIVELLO
        s.codice ?? '',          // Codice
        s.padre ?? '',           // UNITA' OPERATIVA PADRE
        s.ruoli_oltrv ?? '',     // RUOLI OltreV
        s.ruoli ?? '',           // RUOLI
        s.viaggiatore ?? '',     // Viaggiatore
        s.segr_redaz ?? '',      // Segr_Redaz
        s.approvatore ?? '',     // Approvatore
        s.cassiere ?? '',        // Cassiere
        s.visualizzatore ?? '',  // Visualizzatori
        s.segretario ?? '',      // Segretario
        s.controllore ?? '',     // Controllore
        s.amministrazione ?? '', // Amministrazione
        s.segreteria_red_asst ?? '', // SegreteriA Red. Ass.ta
        s.segretario_asst ?? '', // SegretariO Ass.to
        s.controllore_asst ?? '',// Controllore Ass.to
        s.ruoli_afc ?? '',       // RuoliAFC
        s.ruoli_hr ?? '',        // RuoliHR
        s.altri_ruoli ?? '',     // AltriRuoli
        s.sede_tns ?? '',        // Sede_TNS
        s.gruppo_sind ?? '',     // GruppoSind
      ]
    }

    function personRow(p: Record<string, string | null>): Row {
      const titolare = [p.cognome, p.nome].filter(Boolean).join(' ')
      return [
        p.societa ?? '',         // Unità Organizzativa
        p.cdc_amministrativo ?? '', // CDCCOSTO
        p.cf ?? '',              // TxCodFiscale
        '',                      // DESCRIZIONE (vuota per persone)
        titolare,                // Titolare
        p.livello_tns ?? '',     // LIVELLO
        p.cf ?? '',              // Codice (= cf per le foglie)
        p.padre_tns ?? '',       // UNITA' OPERATIVA PADRE
        p.ruoli_oltrv ?? '',     // RUOLI OltreV
        p.ruoli_tns_desc ?? '',  // RUOLI
        p.viaggiatore ?? '',     // Viaggiatore
        p.segr_redaz ?? '',      // Segr_Redaz
        p.approvatore ?? '',     // Approvatore
        p.cassiere ?? '',        // Cassiere
        p.visualizzatore ?? '',  // Visualizzatori
        p.segretario ?? '',      // Segretario
        p.controllore ?? '',     // Controllore
        p.amministrazione ?? '', // Amministrazione
        p.segreteria_red_asst ?? '', // SegreteriA Red. Ass.ta
        p.segretario_asst ?? '', // SegretariO Ass.to
        p.controllore_asst ?? '',// Controllore Ass.to
        p.ruoli_afc ?? '',       // RuoliAFC
        p.ruoli_hr ?? '',        // RuoliHR
        p.altri_ruoli ?? '',     // AltriRuoli
        p.sede_tns ?? '',        // Sede_TNS
        p.gruppo_sind ?? '',     // GruppoSind
      ]
    }

    const struttureRows = strutture.map(strutRow)
    const personeRows = persone.map(personRow)

    const wb = XLSX.utils.book_new()

    // DB_TNS: strutture + persone combined (strutture prima)
    const dbTnsData = [HEADERS, ...struttureRows, ...personeRows]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dbTnsData), 'DB_TNS')

    // TNS Personale: solo persone
    const personaleData = [HEADERS, ...personeRows]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(personaleData), 'TNS Personale')

    // TNS Strutture: solo strutture
    const struttureData = [HEADERS, ...struttureRows]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(struttureData), 'TNS Strutture')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const now = new Date()
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="TNS_ORG_${dateStr}.xlsx"`,
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
