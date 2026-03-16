import * as XLSX from 'xlsx'
import type { SchedaMovimentoParsed } from '@/types'

export type { SchedaMovimentoParsed }

function excelDate(v: unknown): string | null {
  if (typeof v !== 'number' || v < 1) return null
  return new Date((v - 25569) * 86400000).toISOString().slice(0, 10)
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

export function parseSchedaMovimento(buffer: Buffer): SchedaMovimentoParsed {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheetName =
    wb.SheetNames.find(n => n.toLowerCase().includes('scheda')) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null })

  const r = (i: number, col: number): unknown => rows[i]?.[col] ?? null

  return {
    tipoMovimento: str(r(5, 2)) ?? 'INGRESSO',
    decorrenza:           excelDate(r(4, 2)),
    cf:                   str(r(9, 2)),
    cognome:              str(r(6, 2)),
    nome:                 str(r(7, 2)),
    sesso:                str(r(8, 1)),            // code from col B
    data_nascita:         excelDate(r(10, 2)),
    comune_nascita:       str(r(11, 2)),
    provincia_nascita:    str(r(12, 2)),
    nazione_nascita:      str(r(13, 2)),
    societa:              str(r(14, 2)),
    area:                 str(r(15, 2)),
    sotto_area:           str(r(16, 2)),
    cdc_amministrativo:   str(r(17, 1)),           // code from col B
    sede:                 str(r(19, 2)),            // description
    tipo_contratto:       str(r(20, 2)),            // description
    qualifica:            str(r(21, 2)),            // description
    matricola:            str(r(22, 1) ?? r(22, 2)),
    email:                str(r(26, 2)),
    job_title:            str(r(29, 2)),
    referente_diretto:    str(r(32, 2)),
    telelavoro:           str(r(23, 2)),
    data_fine_rapporto:   excelDate(r(28, 2)),
    note:                 str(r(42, 2)),
    provenienza_societa:  str(r(33, 2)),
    provenienza_area:     str(r(34, 2)),
    provenienza_sotto_area: str(r(35, 2)),
  }
}
