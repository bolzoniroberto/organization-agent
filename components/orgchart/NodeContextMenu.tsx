'use client'
import React, { useEffect, useRef } from 'react'
import { GitBranch, Navigation, FileText, X, Pin, PinOff } from 'lucide-react'

interface NodeContextMenuProps {
  x: number
  y: number
  label: string
  hasChildren: boolean
  isPinned: boolean
  onPin: () => void
  onUnpin: () => void
  onFocusExpand: () => void
  onDrillIn: () => void
  onOpenDetail: () => void
  onClose: () => void
}

export default function NodeContextMenu({
  x, y, label, hasChildren, isPinned, onPin, onUnpin,
  onFocusExpand, onDrillIn, onOpenDetail, onClose
}: NodeContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  // Keep menu inside viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 9999,
    transform: 'translate(8px, -8px)'
  }

  return (
    <div ref={ref} style={style}
      className="min-w-[200px] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl overflow-hidden py-1">
      <div className="px-3 py-1.5 border-b border-slate-700">
        <p className="text-xs text-slate-400 truncate max-w-[180px]">{label}</p>
      </div>

      {hasChildren && (
        <button onClick={() => { onFocusExpand(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-indigo-600/30 hover:text-indigo-200 transition-colors text-left">
          <GitBranch className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Focus &amp; Expand</span>
        </button>
      )}

      {hasChildren && (
        <button onClick={() => { onDrillIn(); onClose() }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors text-left">
          <Navigation className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>Entra (figli diretti)</span>
        </button>
      )}

      <button onClick={() => { onOpenDetail(); onClose() }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors text-left">
        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>Apri dettaglio</span>
      </button>

      <div className="border-t border-slate-700 mt-1 pt-1">
        {isPinned ? (
          <button onClick={() => { onUnpin(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 transition-colors text-left">
            <PinOff className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span>Rimuovi pin</span>
          </button>
        ) : (
          <button onClick={() => { onPin(); onClose() }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-200 hover:bg-yellow-600/20 hover:text-yellow-200 transition-colors text-left">
            <Pin className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
            <span>Fissa come vista</span>
          </button>
        )}
        <button onClick={onClose}
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-700 transition-colors text-left">
          <X className="w-3 h-3 shrink-0" />
          <span>Chiudi</span>
        </button>
      </div>
    </div>
  )
}
