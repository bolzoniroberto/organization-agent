import React from 'react'
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react'

interface ToastProps {
  message: string
  type: 'success' | 'error' | 'warning'
  onClose: () => void
}

const icons = {
  success: <CheckCircle className="w-4 h-4 text-green-400" />,
  error: <XCircle className="w-4 h-4 text-red-400" />,
  warning: <AlertCircle className="w-4 h-4 text-yellow-400" />
}

const styles = {
  success: 'bg-slate-800 border-green-700 text-green-200',
  error: 'bg-slate-800 border-red-700 text-red-200',
  warning: 'bg-slate-800 border-yellow-700 text-yellow-200'
}

export default function Toast({ message, type, onClose }: ToastProps) {
  return (
    <div className={`fixed bottom-4 right-4 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm z-50 max-w-sm ${styles[type]}`}>
      {icons[type]}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
