import React from 'react'
import { Info } from 'lucide-react'

interface InfoDialogProps {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  onClose: () => void
}

export default function InfoDialog({
  open, title, message, confirmLabel = 'Ho capito', onClose
}: InfoDialogProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-2 bg-indigo-500/20 rounded-full">
            <Info className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="flex-1 mt-0.5">
            <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
            <div className="mt-2 text-sm text-slate-300 leading-relaxed">
              {message}
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors rounded-lg shadow-sm"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
