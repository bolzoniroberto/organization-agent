'use client'
import React, { useEffect } from 'react'
import TopMenuBar from './TopMenuBar'
import Toast from '@/components/shared/Toast'
import { useHRStore } from '@/store/useHRStore'

interface AppShellProps {
  children: React.ReactNode
}

export default function AppShell({ children }: AppShellProps) {
  const { refreshCounts, toast, clearToast } = useHRStore()

  useEffect(() => {
    refreshCounts()
  }, [])

  return (
    <div className="flex flex-col h-screen bg-slate-950">
      <TopMenuBar />
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type as 'success' | 'error' | 'warning'}
          onClose={clearToast}
        />
      )}
    </div>
  )
}
