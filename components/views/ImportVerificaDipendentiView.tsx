'use client'
import React, { useRef, useState, useMemo } from 'react'
import { Upload, Search, UserCheck, UserX, RefreshCw, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useHRStore } from '@/store/useHRStore'

interface PuntualiPersona {
  cf: string
  cognome: string | null
  nome: string | null
  sesso: string | null
  data_nascita: string | null
  societa: string | null
  area: string | null
  sotto_area: string | null
  cdc_amministrativo: string | null
  sede: string | null
  tipo_contratto: string | null
  qualifica: string | null
  livello: string | null
  data_assunzione: string | null
  data_fine_rapporto: string | null
  email: string | null
  part_time: number
  matricola: string | null
}

interface DbPersona {
  cf: string
  cognome: string | null
  nome: string | null
  societa: string | null
  area: string | null
  sotto_area: string | null
  qualifica: string | null
  data_assunzione: string | null
  data_fine_rapporto: string | null
  sede: string | null
  tipo_contratto: string | null
  livello: string | null
}

interface AnalysisResult {
  totale: number
  nPresenti: number
  mancanti: PuntualiPersona[]
  daRipristinare: PuntualiPersona[]
  soloInDb: DbPersona[]
}

type Filter = 'mancanti' | 'ripristinare' | 'tutti' | 'soloInDb'

function Badge({ label, count, color, onClick, active }: {
  label: string; count: number; color: string; onClick?: () => void; active?: boolean
}) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col items-center px-4 py-2 rounded-lg border transition-colors ${color} ${onClick ? 'cursor-pointer' : ''} ${active ? 'ring-2 ring-indigo-500 ring-offset-1 ring-offset-slate-950' : ''}`}
    >
      <span className="text-xl font-semibold">{count}</span>
      <span className="text-xs mt-0.5 opacity-75">{label}</span>
    </div>
  )
}

export default function ImportVerificaDipendentiView() {
  const { refreshAll } = useHRStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const [filter, setFilter] = useState<Filter>('mancanti')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [importing, setImporting] = useState(false)
  const [eliminating, setEliminating] = useState(false)
  const [decorrenza, setDecorrenza] = useState(() => new Date().toISOString().slice(0, 10))

  const [importResult, setImportResult] = useState<{ importati: number; ripristinati: number; errors: string[] } | null>(null)
  const [eliminaResult, setEliminaResult] = useState<{ eliminati: number; nodiChiusi: number; supervisioniChiuse: number; errors: string[] } | null>(null)
  const [confirmElimina, setConfirmElimina] = useState(false)

  const handleFileChange = (f: File) => {
    setFile(f)
    setResult(null)
    setImportResult(null)
    setEliminaResult(null)
    setSelected(new Set())
    setAnalyzeError(null)
    setConfirmElimina(false)
  }

  const handleAnalyze = async () => {
    if (!file) return
    setAnalyzing(true)
    setAnalyzeError(null)
    setResult(null)
    setSelected(new Set())
    setImportResult(null)
    setEliminaResult(null)
    setConfirmElimina(false)
    try {
      const data = await api.import.verificaDipendenti.analyze(file) as AnalysisResult
      setResult(data)
      setFilter('mancanti')
      const allCfs = [...data.mancanti, ...data.daRipristinare].map(p => p.cf)
      setSelected(new Set(allCfs))
    } catch (e) {
      setAnalyzeError(String(e))
    } finally {
      setAnalyzing(false)
    }
  }

  const isDbTab = filter === 'soloInDb'

  const visibleRows = useMemo((): (PuntualiPersona | DbPersona)[] => {
    if (!result) return []
    let rows: (PuntualiPersona | DbPersona)[] = []
    if (filter === 'soloInDb') rows = result.soloInDb
    else if (filter === 'mancanti') rows = result.mancanti
    else if (filter === 'ripristinare') rows = result.daRipristinare
    else rows = [...result.mancanti, ...result.daRipristinare]

    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter(p =>
        [p.cf, p.cognome, p.nome, p.area, p.qualifica].some(v => v?.toLowerCase().includes(q))
      )
    }
    return rows
  }, [result, filter, search])

  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(p => selected.has(p.cf))

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => { const n = new Set(prev); visibleRows.forEach(p => n.delete(p.cf)); return n })
    } else {
      setSelected(prev => { const n = new Set(prev); visibleRows.forEach(p => n.add(p.cf)); return n })
    }
  }

  const toggle = (cf: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(cf) ? n.delete(cf) : n.add(cf); return n })
  }

  const handleImport = async () => {
    if (!result || selected.size === 0) return
    const toImport = [...result.mancanti, ...result.daRipristinare].filter(p => selected.has(p.cf))
    setImporting(true)
    try {
      const res = await api.import.verificaDipendenti.execute(toImport) as { importati: number; ripristinati: number; errors: string[] }
      setImportResult(res)
      setSelected(new Set())
      await refreshAll()
    } catch (e) {
      setImportResult({ importati: 0, ripristinati: 0, errors: [String(e)] })
    } finally {
      setImporting(false)
    }
  }

  const handleElimina = async () => {
    if (!result || selected.size === 0) return
    const cfs = result.soloInDb.filter(p => selected.has(p.cf)).map(p => p.cf)
    setEliminating(true)
    setConfirmElimina(false)
    try {
      const res = await api.import.verificaDipendenti.elimina(cfs, decorrenza) as { eliminati: number; nodiChiusi: number; supervisioniChiuse: number; errors: string[] }
      setEliminaResult(res)
      // Remove eliminated from result
      setResult(prev => prev ? { ...prev, soloInDb: prev.soloInDb.filter(p => !cfs.includes(p.cf)) } : prev)
      setSelected(new Set())
      await refreshAll()
    } catch (e) {
      setEliminaResult({ eliminati: 0, nodiChiusi: 0, supervisioniChiuse: 0, errors: [String(e)] })
    } finally {
      setEliminating(false)
    }
  }

  const totalToImport = result ? result.mancanti.length + result.daRipristinare.length : 0
  const selectedImport = result ? [...result.mancanti, ...result.daRipristinare].filter(p => selected.has(p.cf)).length : 0
  const selectedDb = result ? result.soloInDb.filter(p => selected.has(p.cf)).length : 0

  return (
    <div className="flex flex-col h-full overflow-auto bg-slate-950">
      <div className="flex-none px-4 py-3 border-b border-slate-700 bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-200">Verifica Dipendenti</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Confronto bidirezionale tra file Puntuali e master data: importa i mancanti · elimina i cessati.
        </p>
      </div>

      <div className="flex-1 p-4 space-y-4">
        {/* Upload */}
        <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 flex items-center gap-4">
          <div
            className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-lg py-6 cursor-pointer hover:border-indigo-600 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileChange(f) }}
          >
            <Upload className="w-6 h-6 text-slate-500 mb-2" />
            {file
              ? <span className="text-sm text-slate-300">{file.name}</span>
              : <span className="text-sm text-slate-500">Trascina il file Puntuali o clicca per selezionare</span>
            }
            <span className="text-xs text-slate-600 mt-1">.xlsx / .xls — foglio "DB"</span>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f) }} />
          </div>
          <button
            onClick={handleAnalyze}
            disabled={!file || analyzing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-md transition-colors disabled:opacity-40 shrink-0"
          >
            {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Analizza
          </button>
        </div>

        {analyzeError && (
          <div className="text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">{analyzeError}</div>
        )}

        {/* Import result */}
        {importResult && (
          <div className={`flex items-start gap-3 rounded-lg px-4 py-3 border text-sm ${importResult.errors.length === 0 ? 'bg-green-950/30 border-green-800 text-green-300' : 'bg-amber-950/30 border-amber-800 text-amber-300'}`}>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">
                {importResult.importati > 0 && `${importResult.importati} ${importResult.importati === 1 ? 'persona creata' : 'persone create'}`}
                {importResult.importati > 0 && importResult.ripristinati > 0 && ' · '}
                {importResult.ripristinati > 0 && `${importResult.ripristinati} ${importResult.ripristinati === 1 ? 'persona ripristinata' : 'persone ripristinate'}`}
              </div>
              <div className="text-xs opacity-75 mt-0.5">
                Visibili in <strong>Organigramma → Posizioni</strong>: clicca il badge arancione <strong>"Non in posizione"</strong> nel pannello sinistro.
              </div>
              {importResult.errors.length > 0 && importResult.errors.map((e, i) => <div key={i} className="text-xs text-red-400 mt-1">{e}</div>)}
            </div>
          </div>
        )}

        {/* Elimina result */}
        {eliminaResult && (
          <div className={`flex items-start gap-3 rounded-lg px-4 py-3 border text-sm ${eliminaResult.errors.length === 0 ? 'bg-green-950/30 border-green-800 text-green-300' : 'bg-amber-950/30 border-amber-800 text-amber-300'}`}>
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">
                {eliminaResult.eliminati} {eliminaResult.eliminati === 1 ? 'persona eliminata' : 'persone eliminate'}
                {eliminaResult.nodiChiusi > 0 && ` · ${eliminaResult.nodiChiusi} nodi chiusi`}
                {eliminaResult.supervisioniChiuse > 0 && ` · ${eliminaResult.supervisioniChiuse} supervisioni chiuse`}
              </div>
              {eliminaResult.errors.length > 0 && eliminaResult.errors.map((e, i) => <div key={i} className="text-xs text-red-400 mt-1">{e}</div>)}
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            {/* Summary badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge label="Nel file" count={result.totale} color="border-slate-600 text-slate-300" />
              <Badge label="Già presenti" count={result.nPresenti} color="border-green-800 text-green-300" />
              <Badge label="Mancanti" count={result.mancanti.length} color="border-amber-700 text-amber-300"
                onClick={() => { setFilter('mancanti'); setSearch(''); setSelected(new Set(result.mancanti.map(p => p.cf))) }}
                active={filter === 'mancanti'} />
              {result.daRipristinare.length > 0 && (
                <Badge label="Da ripristinare" count={result.daRipristinare.length} color="border-orange-700 text-orange-300"
                  onClick={() => { setFilter('ripristinare'); setSearch(''); setSelected(new Set(result.daRipristinare.map(p => p.cf))) }}
                  active={filter === 'ripristinare'} />
              )}
              <div className="w-px h-10 bg-slate-700 mx-1" />
              <Badge label="Solo nel DB" count={result.soloInDb.length} color="border-red-800 text-red-300"
                onClick={() => { setFilter('soloInDb'); setSearch(''); setSelected(new Set()) }}
                active={filter === 'soloInDb'} />
            </div>

            {/* Main table */}
            {(totalToImport > 0 || result.soloInDb.length > 0) && (
              <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                {/* Toolbar */}
                <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-800 flex-wrap">
                  <div className="flex gap-1">
                    {totalToImport > 0 && ([
                      { id: 'mancanti' as Filter, label: `Mancanti (${result.mancanti.length})` },
                      ...(result.daRipristinare.length > 0 ? [{ id: 'ripristinare' as Filter, label: `Da ripristinare (${result.daRipristinare.length})` }] : []),
                      { id: 'tutti' as Filter, label: `Tutti da importare (${totalToImport})` },
                    ]).map(tab => (
                      <button key={tab.id} onClick={() => { setFilter(tab.id); setSearch('') }}
                        className={`px-2.5 py-1 text-xs rounded transition-colors ${filter === tab.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}>
                        {tab.label}
                      </button>
                    ))}
                    {result.soloInDb.length > 0 && (
                      <button onClick={() => { setFilter('soloInDb'); setSearch(''); setSelected(new Set()) }}
                        className={`px-2.5 py-1 text-xs rounded transition-colors ${filter === 'soloInDb' ? 'bg-red-700 text-white' : 'text-red-400 hover:text-red-200 hover:bg-red-950/40'}`}>
                        Solo nel DB ({result.soloInDb.length})
                      </button>
                    )}
                  </div>

                  <div className="flex-1" />

                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Cerca CF, cognome, area…"
                      className="pl-6 pr-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-slate-300 w-44 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600" />
                  </div>

                  {/* CTA — import o elimina in base al tab */}
                  {!isDbTab ? (
                    <button onClick={handleImport} disabled={selectedImport === 0 || importing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors disabled:opacity-40">
                      {importing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UserCheck className="w-3 h-3" />}
                      Importa selezionati ({selectedImport})
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-400">Decorrenza</label>
                      <input type="date" value={decorrenza} onChange={e => setDecorrenza(e.target.value)}
                        className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-red-500" />
                      {!confirmElimina ? (
                        <button onClick={() => setConfirmElimina(true)} disabled={selectedDb === 0}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-800 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-40">
                          <Trash2 className="w-3 h-3" />
                          Elimina selezionati ({selectedDb})
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-red-400">Confermi l&apos;eliminazione di {selectedDb} persone?</span>
                          <button onClick={handleElimina} disabled={eliminating}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-40">
                            {eliminating ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                            Sì, elimina
                          </button>
                          <button onClick={() => setConfirmElimina(false)}
                            className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 rounded hover:bg-slate-700 transition-colors">
                            Annulla
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Warning tab soloInDb */}
                {isDbTab && (
                  <div className="flex items-start gap-2 px-3 py-2 border-b border-slate-700 bg-red-950/20 text-xs text-red-300">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      Questi record sono attivi nel DB ma assenti nel file Puntuali. Possono essere dipendenti cessati, distaccati o con variazioni.
                      L&apos;eliminazione imposta <code className="font-mono">deleted_at</code> e chiude eventuali nodi organigramma e supervisioni (soft delete, reversibile).
                    </span>
                  </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-800 z-10">
                      <tr>
                        <th className="w-8 px-2 py-2 border-b border-slate-700">
                          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="accent-indigo-500" />
                        </th>
                        <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">CF</th>
                        <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">Cognome</th>
                        <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">Nome</th>
                        <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">Azienda</th>
                        <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">Area</th>
                        <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">Qualifica</th>
                        <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">Data ass.</th>
                        {isDbTab && <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">Fine rapporto</th>}
                        {!isDbTab && <th className="px-2 py-2 text-left text-slate-400 font-medium border-b border-slate-700 whitespace-nowrap">Stato</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map(p => {
                        const isMancante = !isDbTab && result.mancanti.some(m => m.cf === p.cf)
                        return (
                          <tr key={p.cf}
                            className={`border-b border-slate-800 cursor-pointer ${selected.has(p.cf) ? (isDbTab ? 'bg-red-950/20' : 'bg-indigo-950/30') : 'hover:bg-slate-800/60'}`}
                            onClick={() => toggle(p.cf)}>
                            <td className="px-2 py-1.5 text-center">
                              <input type="checkbox" checked={selected.has(p.cf)} onChange={() => toggle(p.cf)}
                                onClick={e => e.stopPropagation()}
                                className={isDbTab ? 'accent-red-500' : 'accent-indigo-500'} />
                            </td>
                            <td className="px-2 py-1.5 font-mono text-slate-400 whitespace-nowrap">{p.cf}</td>
                            <td className="px-2 py-1.5 text-slate-200 whitespace-nowrap">{p.cognome}</td>
                            <td className="px-2 py-1.5 text-slate-300 whitespace-nowrap">{p.nome}</td>
                            <td className="px-2 py-1.5 text-slate-400 max-w-[120px] truncate" title={p.societa ?? ''}>{p.societa}</td>
                            <td className="px-2 py-1.5 text-slate-400 max-w-[120px] truncate" title={p.area ?? ''}>{p.area}</td>
                            <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{p.qualifica}</td>
                            <td className="px-2 py-1.5 text-slate-500 font-mono whitespace-nowrap">{p.data_assunzione}</td>
                            {isDbTab && (
                              <td className="px-2 py-1.5 text-slate-500 font-mono whitespace-nowrap">
                                {(p as DbPersona).data_fine_rapporto ?? <span className="text-slate-700">—</span>}
                              </td>
                            )}
                            {!isDbTab && (
                              <td className="px-2 py-1.5">
                                {isMancante
                                  ? <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-900/40 text-amber-300 border border-amber-800">
                                      <UserX className="w-2.5 h-2.5" /> Mancante
                                    </span>
                                  : <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-orange-900/40 text-orange-300 border border-orange-800">
                                      <AlertTriangle className="w-2.5 h-2.5" /> Da ripristinare
                                    </span>
                                }
                              </td>
                            )}
                          </tr>
                        )
                      })}
                      {visibleRows.length === 0 && (
                        <tr><td colSpan={isDbTab ? 10 : 9} className="px-2 py-6 text-center text-slate-600">Nessun risultato</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
