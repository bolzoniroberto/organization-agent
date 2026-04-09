'use client'
import React, { useCallback, useRef, useState, useEffect } from 'react'
import { Send, Loader2, AlertTriangle, ChevronDown, ChevronRight, Trash2, Zap, Paperclip, X, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useHRStore } from '@/store/useHRStore'
import type { OrdineServizioAnalysis, OrdineServizioProposal, ProposalTipo } from '@/types'

// ── Tipi locali ───────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: string | null
  created_at?: string
  proposals?: OrdineServizioProposal[]
}

// ── Costanti di stile ─────────────────────────────────────────────────────────

const TIPO_COLORS: Record<ProposalTipo, string> = {
  INSERT_PERSONA:      'bg-emerald-700/30 text-emerald-300 border-emerald-700',
  UPDATE_PERSONA:      'bg-blue-700/30 text-blue-300 border-blue-700',
  DELETE_PERSONA:      'bg-red-700/30 text-red-300 border-red-700',
  INSERT_NODO:         'bg-emerald-700/30 text-emerald-300 border-emerald-700',
  UPDATE_NODO:         'bg-blue-700/30 text-blue-300 border-blue-700',
  REPARENT_NODO:       'bg-amber-700/30 text-amber-300 border-amber-700',
  UPDATE_RUOLO_TNS:    'bg-violet-700/30 text-violet-300 border-violet-700',
  INSERT_STRUTTURA_TNS:'bg-violet-700/30 text-violet-300 border-violet-700',
  UPDATE_STRUTTURA_TNS:'bg-violet-700/30 text-violet-300 border-violet-700',
}

const CONFIDENCE_DOT: Record<string, string> = {
  high:   'bg-emerald-400',
  medium: 'bg-amber-400',
  low:    'bg-red-400',
}

function confidenceLabel(c: string) {
  return c === 'high' ? 'Alta' : c === 'medium' ? 'Media' : 'Bassa'
}

// ── ProposalCard ──────────────────────────────────────────────────────────────

function ProposalCard({ p, checked, onToggle }: { p: OrdineServizioProposal; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false)

  const changedFields = Object.keys(p.data)

  return (
    <div className={`border rounded-lg transition-colors ${checked ? 'border-slate-600 bg-slate-800/60' : 'border-slate-700/40 bg-slate-900/20 opacity-50'}`}>
      {/* Header */}
      <div className="flex items-start gap-2.5 p-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 accent-indigo-500 w-4 h-4 cursor-pointer flex-none"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${TIPO_COLORS[p.tipo]}`}>{p.tipo}</span>
            {p.entityLabel && <span className="text-xs font-medium text-slate-200">{p.entityLabel}</span>}
            {p.entityId && <span className="text-xs text-slate-500 font-mono">{p.entityId}</span>}
            <span className="flex items-center gap-1 text-xs text-slate-500 ml-auto flex-none">
              <span className={`w-1.5 h-1.5 rounded-full ${CONFIDENCE_DOT[p.confidence]}`} />
              {confidenceLabel(p.confidence)}
            </span>
          </div>
          <p className="text-sm text-slate-200">{p.label}</p>
        </div>
      </div>

      {/* Before/After table */}
      {changedFields.length > 0 && (
        <div className="mx-3 mb-2 rounded border border-slate-700/50 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="text-left px-2 py-1 text-slate-500 font-medium w-1/3">Campo</th>
                <th className="text-left px-2 py-1 text-slate-500 font-medium w-1/3">Prima</th>
                <th className="text-left px-2 py-1 text-slate-400 font-medium w-1/3">Dopo</th>
              </tr>
            </thead>
            <tbody>
              {changedFields.map(field => {
                const before = p.currentValues?.[field]
                const after = p.data[field]
                return (
                  <tr key={field} className="border-t border-slate-700/40">
                    <td className="px-2 py-1 text-slate-400 font-mono">{field}</td>
                    <td className="px-2 py-1 text-slate-500">
                      {before !== undefined && before !== null ? String(before) : <span className="text-slate-700">—</span>}
                    </td>
                    <td className="px-2 py-1 text-indigo-300 font-medium">
                      {after !== null && after !== undefined ? String(after) : <span className="text-red-400/70">null</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Motivazione */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Motivazione
        </button>
        {open && <p className="text-xs text-slate-500 mt-1 pl-4 border-l border-slate-700">{p.rationale}</p>}
      </div>
    </div>
  )
}

// ── ProposalsBlock ────────────────────────────────────────────────────────────

function ProposalsBlock({ proposals, messageId }: { proposals: OrdineServizioProposal[]; messageId: string }) {
  const { showToast, refreshAll } = useHRStore()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(proposals.map(p => p.id)))
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const apply = async () => {
    const toApply = proposals.filter(p => selected.has(p.id))
    if (toApply.length === 0) return
    setApplying(true)
    try {
      const res = await api.agents.executeOrdineServizio(toApply)
      setApplied(true)
      await refreshAll()
      if (res.errors.length === 0) {
        showToast(`${res.applied} proposte applicate`, 'success')
      } else {
        showToast(`${res.applied} applicate, ${res.errors.length} errori`, 'error')
      }
    } catch (err) {
      showToast(`Errore: ${String(err)}`, 'error')
    } finally {
      setApplying(false)
    }
  }

  if (applied) {
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
        <CheckCircle2 className="w-4 h-4" />
        Proposte applicate
      </div>
    )
  }

  return (
    <div className="mt-2 border border-slate-700/60 rounded-xl overflow-hidden" key={messageId}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/80 border-b border-slate-700/60">
        <span className="text-xs font-medium text-slate-300">{proposals.length} {proposals.length === 1 ? 'proposta' : 'proposte'}</span>
        <div className="flex gap-3 text-xs">
          <button onClick={() => setSelected(new Set(proposals.map(p => p.id)))} className="text-indigo-400 hover:text-indigo-300">Seleziona tutti</button>
          <button onClick={() => setSelected(new Set())} className="text-slate-500 hover:text-slate-400">Deseleziona</button>
        </div>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2 bg-slate-900/40">
        {proposals.map(p => (
          <ProposalCard key={p.id} p={p} checked={selected.has(p.id)} onToggle={() => toggle(p.id)} />
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 bg-slate-800/60 border-t border-slate-700/60 flex justify-end">
        <button
          onClick={apply}
          disabled={selected.size === 0 || applying}
          className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
        >
          {applying && <Loader2 className="w-3 h-3 animate-spin" />}
          Applica {selected.size} selezionate
        </button>
      </div>
    </div>
  )
}

// ── Markdown semplice ─────────────────────────────────────────────────────────

function SimpleMarkdown({ text }: { text: string }) {
  // Minimal inline rendering: bold, code, line breaks
  const lines = text.split('\n')
  return (
    <div className="space-y-0.5 text-sm text-slate-200 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <p key={i} className="font-semibold text-slate-100 mt-2">{line.slice(3)}</p>
        if (line.startsWith('# '))  return <p key={i} className="font-bold text-white mt-2">{line.slice(2)}</p>
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return <p key={i} className="pl-3 text-slate-300">• {line.slice(2)}</p>
        }
        if (line.trim() === '') return <div key={i} className="h-1" />
        // Inline bold **...**
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
        return (
          <p key={i}>
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) return <strong key={j} className="text-slate-100">{part.slice(2, -2)}</strong>
              if (part.startsWith('`') && part.endsWith('`')) return <code key={j} className="bg-slate-700/60 px-1 rounded text-xs font-mono text-indigo-300">{part.slice(1, -1)}</code>
              return <span key={j}>{part}</span>
            })}
          </p>
        )
      })}
    </div>
  )
}

// ── AgentiView principale ─────────────────────────────────────────────────────

const ACCEPTED_EXTS = '.pdf,.docx,.doc,.xls,.xlsx,.csv,.md,.txt'
const EFFICIENCY_PROMPT = 'Analizza il database e proponi miglioramenti di efficienza organizzativa e qualità dei dati: posizioni scoperte, span of control eccessivo, persone senza nodo, contratti scaduti non chiusi.'

export default function AgentiView() {
  const { showToast, refreshAll } = useHRStore()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Carica storico
  useEffect(() => {
    api.agents.chat.history(100).then(({ messages: hist }) => {
      setMessages(hist.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        metadata: m.metadata,
        created_at: m.created_at,
        proposals: m.metadata ? (() => {
          try { const p = JSON.parse(m.metadata!); return p.proposals ?? undefined } catch { return undefined }
        })() : undefined
      })))
      setLoadingHistory(false)
    }).catch(() => setLoadingHistory(false))
  }, [])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async (text: string, file?: File) => {
    if (!text.trim() && !file) return
    setLoading(true)

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim() || (file ? `[Documento: ${file.name}]` : ''),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setAttachedFile(null)

    try {
      let proposals: OrdineServizioProposal[] | undefined
      let response: string

      if (file) {
        // Usa ordine-servizio per file upload, poi inietta nel chat
        const analysis: OrdineServizioAnalysis = await api.agents.analyzeOrdineServizio({ file, prompt: text.trim() || undefined })
        response = analysis.sommario
        proposals = analysis.proposte
        // Non salva nel DB della chat (solo locale)
      } else {
        const result = await api.agents.chat.send(text.trim())
        response = result.response
        proposals = result.proposals
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response,
        proposals,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `⚠️ Errore: ${String(err)}`,
      }
      setMessages(prev => [...prev, errMsg])
      showToast(String(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const handleSend = () => sendMessage(input, attachedFile ?? undefined)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = async () => {
    await api.agents.chat.clear()
    setMessages([])
    showToast('Conversazione cancellata', 'success')
  }

  return (
    <div className="flex flex-col h-full bg-slate-950">
      {/* Header */}
      <div className="flex-none flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700">
        <div>
          <h1 className="text-sm font-semibold text-slate-200">Assistente HR</h1>
          <p className="text-xs text-slate-500">Descrivi un problema o chiedi un'analisi</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => sendMessage(EFFICIENCY_PROMPT)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50 text-amber-300 rounded-lg transition-colors disabled:opacity-40"
            title="Analisi automatica di anomalie e inefficienze nel database"
          >
            <Zap className="w-3.5 h-3.5" />
            Analisi Efficienza
          </button>
          <button
            onClick={handleClear}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
            title="Cancella conversazione"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loadingHistory && (
          <div className="flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <div className="text-3xl">💬</div>
            <p className="text-slate-400 font-medium">Inizia una conversazione</p>
            <p className="text-xs text-slate-600 max-w-sm">
              Descrivi un problema organizzativo, chiedi di trovare anomalie, o usa <strong className="text-amber-400/80">Analisi Efficienza</strong> per proposte automatiche.
            </p>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                'Cerca persone con contratto scaduto non ancora cessate',
                'Quali UO hanno più di 10 riporti diretti?',
                'Trova posizioni senza persona assegnata',
              ].map(s => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 rounded-full transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${msg.role === 'user' ? 'max-w-[70%]' : 'w-full max-w-full'}`}>
              {msg.role === 'user' ? (
                <div className="bg-slate-700/70 text-slate-100 text-sm px-4 py-2.5 rounded-2xl rounded-tr-md">
                  {msg.content}
                </div>
              ) : (
                <div className="bg-slate-800/80 border border-slate-700/50 px-4 py-3 rounded-2xl rounded-tl-md">
                  {msg.content && <SimpleMarkdown text={msg.content} />}
                  {msg.proposals && msg.proposals.length > 0 && (
                    <ProposalsBlock proposals={msg.proposals} messageId={msg.id} />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 border border-slate-700/50 px-4 py-3 rounded-2xl rounded-tl-md">
              <div className="flex items-center gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span className="text-sm">Analisi in corso…</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="flex-none border-t border-slate-700 bg-slate-900 p-3">
        {attachedFile && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-slate-300">
              <Paperclip className="w-3.5 h-3.5 text-slate-500" />
              <span className="truncate max-w-48">{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} className="text-slate-500 hover:text-slate-300 ml-1">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_EXTS}
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setAttachedFile(f); e.target.value = '' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors flex-none"
            title="Allega documento (PDF, DOCX, XLS…)"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Descrivi un problema o chiedi un'analisi… (Invio per inviare, Shift+Invio per andare a capo)"
            rows={2}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && !attachedFile)}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-none"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
