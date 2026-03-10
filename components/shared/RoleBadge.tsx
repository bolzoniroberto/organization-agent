import React from 'react'

interface RoleBadgeProps {
  value: string | null
  label?: string
}

const BADGE_COLORS: Record<string, string> = {
  STRUTTURA: 'bg-slate-700 text-slate-300',
  PERSONA: 'bg-indigo-900/60 text-indigo-300',
  ANOMALIA: 'bg-amber-900/50 text-amber-300',
  TNS: 'bg-green-900/50 text-green-300',
  TIMESHEET: 'bg-purple-900/50 text-purple-300',
}

function getBadgeColor(value: string): string {
  return BADGE_COLORS[value.toUpperCase()] ?? 'bg-gray-700 text-gray-300'
}

export default function RoleBadge({ value, label }: RoleBadgeProps) {
  if (!value) {
    return <span className="text-slate-600 text-sm">—</span>
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${getBadgeColor(value)}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {label ?? value}
    </span>
  )
}
