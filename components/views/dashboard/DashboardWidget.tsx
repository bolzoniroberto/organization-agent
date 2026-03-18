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
export type WidgetW = 3 | 4 | 6 | 12
export type WidgetH = 1 | 2 | 3

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

const ROW_H:   Record<WidgetH, number> = { 1: 260, 2: 400, 3: 560 }
const CHART_H: Record<WidgetH, number> = { 1: 160, 2: 300, 3: 460 }

const TOOLTIP_STYLE = {
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 6,
  fontSize: 12,
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '\u2026'
}

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
      const outerRadius = config.h === 3 ? 150 : config.h === 2 ? 110 : 65
      const useLegend = data.length <= 8
      const cy = useLegend ? '45%' : '50%'
      return (
        <ResponsiveContainer width="100%" height={chartH}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy={cy}
              outerRadius={outerRadius}
              label={useLegend ? undefined : ({ percent }) =>
                (percent ?? 0) >= 0.04 ? `${((percent ?? 0) * 100).toFixed(0)}%` : undefined
              }
              labelLine={!useLegend}
            >
              {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => (v ?? 0).toLocaleString()} contentStyle={TOOLTIP_STYLE} />
            {useLegend && (
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 4 }}
                formatter={(value) => truncate(String(value), 22)}
              />
            )}
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
            <Tooltip formatter={(v) => `${v}%`} contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="s" fill={PALETTE[i % PALETTE.length]} />)}
          </BarChart>
        </ResponsiveContainer>
      )
    }

    if (config.chartType === 'horizontal') {
      const maxLabelLen = Math.max(...data.map(d => d.name.length), 0)
      const leftMargin = Math.min(100, Math.max(60, maxLabelLen * 5.5))
      const truncatedData = data.map(d => ({ ...d, name: truncate(d.name, 18) }))
      return (
        <ResponsiveContainer width="100%" height={chartH}>
          <BarChart data={truncatedData} layout="vertical" margin={{ top: 5, right: 20, left: leftMargin, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={leftMargin} />
            <Tooltip formatter={(v) => (v ?? 0).toLocaleString()} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="value" fill={PALETTE[0]} radius={[0, 3, 3, 0]}>
              {truncatedData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )
    }

    // bar (default)
    const maxLabelLen = config.w <= 4 ? 10 : 14
    const angle = config.w <= 4 ? -45 : -30
    const bottomMargin = config.w <= 4 ? 50 : 35
    const truncatedData = data.map(d => ({ ...d, name: truncate(d.name, maxLabelLen) }))
    return (
      <ResponsiveContainer width="100%" height={chartH}>
        <BarChart data={truncatedData} margin={{ top: 5, right: 20, left: 0, bottom: bottomMargin }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} angle={angle} textAnchor="end" interval={0} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <Tooltip formatter={(v) => (v ?? 0).toLocaleString()} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" fill={PALETTE[0]} radius={[3, 3, 0, 0]}>
            {truncatedData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  const wLabels: Record<WidgetW, string> = { 3: '1/4', 4: '1/3', 6: '1/2', 12: '1/1' }
  const hLabels: Record<WidgetH, string> = { 1: 'S', 2: 'M', 3: 'L' }

  return (
    <div ref={setNodeRef} style={style} className="bg-slate-800 border border-slate-700 rounded-lg flex flex-col overflow-hidden shadow-md">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-700 shrink-0">
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
          {([3, 4, 6, 12] as WidgetW[]).map(w => (
            <button
              key={w}
              onClick={() => onResize({ w })}
              title={wLabels[w]}
              className={[
                'px-1.5 py-0.5 text-[10px] rounded transition-colors',
                config.w === w
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
              ].join(' ')}
            >
              {wLabels[w]}
            </button>
          ))}
        </div>

        {/* Height controls */}
        <div className="flex items-center gap-0.5 mr-1">
          {([1, 2, 3] as WidgetH[]).map(h => (
            <button
              key={h}
              onClick={() => onResize({ h })}
              title={`Altezza ${hLabels[h]}`}
              className={[
                'px-1.5 py-0.5 text-[10px] rounded transition-colors',
                config.h === h
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
              ].join(' ')}
            >
              {hLabels[h]}
            </button>
          ))}
        </div>

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
