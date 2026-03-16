'use client'
import React from 'react'
import { GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, Cell, PieChart, Pie
} from 'recharts'

export type ChartType = 'bar' | 'horizontal' | 'pie' | 'stack100'
export type WidgetW = 4 | 6 | 12
export type WidgetH = 1 | 2

export interface WidgetConfig {
  id: string
  metricKey: string
  chartType: ChartType
  title: string
  w: WidgetW
  h: WidgetH
}

const PALETTE = [
  '#6366f1','#818cf8','#a5b4fc','#38bdf8','#34d399',
  '#fbbf24','#fb923c','#f87171','#e879f9','#2dd4bf',
  '#60a5fa','#a78bfa','#f472b6','#86efac','#fde68a',
]

// row heights in px
const ROW_H: Record<WidgetH, number> = { 1: 280, 2: 520 }
const CHART_H: Record<WidgetH, number> = { 1: 170, 2: 410 }

interface Props {
  config: WidgetConfig
  data: { name: string; value: number }[]
  onRemove: () => void
  onResize: (patch: Partial<Pick<WidgetConfig, 'w' | 'h'>>) => void
}

export default function DashboardWidget({ config, data, onRemove, onResize }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: config.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    gridColumn: `span ${config.w}`,
    height: ROW_H[config.h],
  }

  const chartH = CHART_H[config.h]

  const renderChart = () => {
    if (config.chartType === 'pie') {
      const outerRadius = config.h === 2 ? 140 : 70
      return (
        <ResponsiveContainer width="100%" height={chartH}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={outerRadius}
              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => (v ?? 0).toLocaleString()} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
          </PieChart>
        </ResponsiveContainer>
      )
    }

    if (config.chartType === 'stack100') {
      const total = data.reduce((s, d) => s + d.value, 0)
      const normalized = data.map(d => ({ name: d.name, value: total > 0 ? Math.round((d.value / total) * 100) : 0 }))
      const singleRow = [normalized.reduce((acc, d) => ({ ...acc, [d.name]: d.value }), { _row: 'Total' } as Record<string, unknown>)]
      const keys = normalized.map(d => d.name)
      return (
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart data={singleRow} layout="vertical" margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis type="category" dataKey="_row" hide />
            <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="s" fill={PALETTE[i % PALETTE.length]} />)}
          </BarChart>
        </ResponsiveContainer>
      )
    }

    if (config.chartType === 'horizontal') {
      return (
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={60} />
            <Tooltip formatter={(v) => (v ?? 0).toLocaleString()} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
            <Bar dataKey="value" fill={PALETTE[0]} radius={[0, 3, 3, 0]}>
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )
    }

    return (
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip formatter={(v) => (v ?? 0).toLocaleString()} contentStyle={{ background: '#1e293b', border: '1px solid #334155' }} />
          <Bar dataKey="value" fill={PALETTE[0]} radius={[3, 3, 0, 0]}>
            {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div ref={setNodeRef} style={style} className="bg-slate-800 border border-slate-700 rounded-lg flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-700 shrink-0">
        {/* Drag handle */}
        <button
          {...attributes} {...listeners}
          className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing p-0.5 rounded"
          title="Trascina per riordinare"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        <span className="flex-1 text-sm font-medium text-slate-200 truncate">{config.title}</span>

        {/* Width controls */}
        <div className="flex items-center gap-0.5 mr-1">
          {([4, 6, 12] as WidgetW[]).map(w => (
            <button
              key={w}
              onClick={() => onResize({ w })}
              title={w === 4 ? '1/3' : w === 6 ? '1/2' : 'Larghezza piena'}
              className={[
                'px-1.5 py-0.5 text-[10px] rounded transition-colors',
                config.w === w
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
              ].join(' ')}
            >
              {w === 4 ? '1/3' : w === 6 ? '1/2' : '1/1'}
            </button>
          ))}
        </div>

        {/* Height toggle */}
        <button
          onClick={() => onResize({ h: config.h === 1 ? 2 : 1 })}
          title={config.h === 1 ? 'Espandi altezza' : 'Riduci altezza'}
          className="px-1.5 py-0.5 text-[10px] rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors mr-1"
        >
          {config.h === 1 ? '↕ 2×' : '↕ 1×'}
        </button>

        <button onClick={onRemove} className="text-slate-500 hover:text-slate-300 text-base leading-none px-1">×</button>
      </div>

      {/* Chart area */}
      <div className="flex-1 flex items-center justify-center p-2 min-h-0">
        {data.length === 0
          ? <span className="text-slate-500 text-sm">Nessun dato</span>
          : renderChart()
        }
      </div>
    </div>
  )
}
