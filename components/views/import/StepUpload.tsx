'use client'
import React, { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X } from 'lucide-react'

interface StepUploadProps {
  file: File | null
  onFileSelect: (file: File) => void
  onNext: () => void
}

export default function StepUpload({ file, onFileSelect, onNext }: StepUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (f: File) => {
    if (f.name.match(/\.(xlsx|xls|csv)$/i)) {
      onFileSelect(f)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  return (
    <div className="flex flex-col items-center gap-6 py-10 px-6 max-w-lg mx-auto">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          'w-full border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors',
          dragging ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600 hover:border-slate-500 bg-slate-800'
        ].join(' ')}
      >
        <Upload className="w-10 h-10 text-slate-500" />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-300">Trascina il file qui o clicca per selezionare</p>
          <p className="text-xs text-slate-500 mt-1">Formati supportati: .xlsx, .xls, .csv</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>

      {file && (
        <div className="w-full flex items-center gap-3 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg">
          <FileSpreadsheet className="w-5 h-5 text-green-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{file.name}</p>
            <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
          <button onClick={e => { e.stopPropagation(); onFileSelect(null as unknown as File) }} className="text-slate-500 hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!file}
        className="px-6 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium"
      >
        Avanti →
      </button>
    </div>
  )
}
