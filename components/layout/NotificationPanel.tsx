'use client'
import React, { useState, useEffect, useCallback } from 'react'
import {
  Bell, X, AlertCircle, AlertTriangle, Info, Lightbulb,
  RefreshCw, Trash2, ChevronRight, Sparkles
} from 'lucide-react'
import { api } from '@/lib/api'
import type { AgentNotification, AgentNotificationSeverity } from '@/types'

const SEVERITY_CONFIG: Record<AgentNotificationSeverity, {
  icon: React.ElementType
  dotColor: string
  borderColor: string
  bgColor: string
  textColor: string
  label: string
}> = {
  critical: {
    icon: AlertCircle,
    dotColor: 'bg-red-500',
    borderColor: 'border-red-800/50',
    bgColor: 'bg-red-950/30',
    textColor: 'text-red-300',
    label: 'Critico',
  },
  warning: {
    icon: AlertTriangle,
    dotColor: 'bg-amber-500',
    borderColor: 'border-amber-800/50',
    bgColor: 'bg-amber-950/20',
    textColor: 'text-amber-300',
    label: 'Attenzione',
  },
  info: {
    icon: Info,
    dotColor: 'bg-blue-500',
    borderColor: 'border-blue-800/50',
    bgColor: 'bg-blue-950/20',
    textColor: 'text-blue-300',
    label: 'Info',
  },
  suggestion: {
    icon: Lightbulb,
    dotColor: 'bg-emerald-500',
    borderColor: 'border-emerald-800/50',
    bgColor: 'bg-emerald-950/20',
    textColor: 'text-emerald-300',
    label: 'Suggerimento',
  },
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ora'
  if (mins < 60) return `${mins}m fa`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h fa`
  const days = Math.floor(hours / 24)
  return `${days}g fa`
}

function NotificationCard({ n, onDismiss, onRead }: {
  n: AgentNotification
  onDismiss: (id: string) => void
  onRead: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const cfg = SEVERITY_CONFIG[n.severity]
  const Icon = cfg.icon

  const handleToggle = () => {
    if (n.status === 'unread') onRead(n.id)
    setExpanded(e => !e)
  }

  return (
    <div className={`border rounded-lg transition-all duration-200 ${cfg.borderColor} ${n.status === 'unread' ? cfg.bgColor : 'bg-transparent opacity-70'}`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left group"
      >
        <Icon className={`w-4 h-4 mt-0.5 flex-none ${cfg.textColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium truncate ${n.status === 'unread' ? 'text-slate-100' : 'text-slate-300'}`}>
              {n.title}
            </p>
            {n.status === 'unread' && (
              <span className={`w-2 h-2 rounded-full flex-none ${cfg.dotColor}`} />
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{formatTimeAgo(n.created_at)}</p>
        </div>
        <ChevronRight className={`w-3.5 h-3.5 text-slate-600 flex-none mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-0">
          <pre className="text-xs text-slate-400 whitespace-pre-wrap font-sans leading-relaxed pl-7">
            {n.body}
          </pre>
          <div className="flex items-center gap-2 mt-2 pl-7">
            {n.entity_type && (
              <span className="text-xs bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded">
                {n.entity_type}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(n.id) }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Ignora
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AgentNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.agents.notifications.list('all')
      setNotifications(res.notifications)
      setUnreadCount(res.unreadCount)
      setLoadError(null)
    } catch (err) {
      setLoadError(String(err))
    }
  }, [])

  // Initial load + poll every 2 minutes
  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 120_000)
    return () => clearInterval(interval)
  }, [loadNotifications])

  const handleScan = async () => {
    setScanning(true)
    try {
      await api.agents.scan()
      await loadNotifications()
    } catch { /* ignore */ }
    setScanning(false)
  }

  const handleDismiss = async (id: string) => {
    await api.agents.notifications.dismiss(id)
    setNotifications(prev => prev.filter(n => n.id !== id))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleRead = async (id: string) => {
    await api.agents.notifications.markRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' as const } : n))
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  const handleDismissAll = async () => {
    await api.agents.notifications.dismissAll()
    setNotifications([])
    setUnreadCount(0)
  }

  return (
    <>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
        title="Notifiche Agente"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full px-1 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Panel */}
      <div
        className={[
          'fixed top-0 right-0 z-50 h-full w-96 max-w-[90vw] bg-slate-900 border-l border-slate-700 shadow-2xl',
          'transform transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-slate-200">Agent Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-xs bg-red-600/30 text-red-300 border border-red-800 px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors disabled:opacity-50"
              title="Esegui scansione watchdog"
            >
              <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
              Scan
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-200 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto h-[calc(100%-96px)] p-3 space-y-2">
          {loadError && (
            <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
              Errore: {loadError}
            </div>
          )}

          {notifications.length === 0 && !loadError && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <Bell className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-sm">Nessuna notifica attiva</p>
              <p className="text-xs mt-1">Clicca "Scan" per eseguire un'analisi</p>
            </div>
          )}

          {notifications.map(n => (
            <NotificationCard
              key={n.id}
              n={n}
              onDismiss={handleDismiss}
              onRead={handleRead}
            />
          ))}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700">
            <span className="text-xs text-slate-500">
              {notifications.length} notifiche
            </span>
            <button
              onClick={handleDismissAll}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Ignora tutte
            </button>
          </div>
        )}
      </div>
    </>
  )
}
