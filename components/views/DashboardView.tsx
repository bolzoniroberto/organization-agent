'use client'
import React, { useMemo, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, arrayMove
} from '@dnd-kit/sortable'
import { useHRStore } from '@/store/useHRStore'
import { usePersistedState } from '@/lib/use-persisted-state'
import DashboardWidget, { type WidgetConfig, type ChartType, type WidgetW, type WidgetH } from './dashboard/DashboardWidget'

type MetricKey =
  | 'headcount_area' | 'headcount_sede' | 'headcount_societa' | 'headcount_qualifica'
  | 'headcount_livello' | 'headcount_tipo_contratto' | 'ral_area' | 'ral_livello'
  | 'span_of_control' | 'depth_gerarchia' | 'fte_funzione' | 'part_time_dist' | 'tipo_nodo_dist'

interface MetricDef {
  key: MetricKey
  label: string
  defaultChart: ChartType
}

const METRIC_DEFS: MetricDef[] = [
  { key: 'headcount_area',           label: 'Headcount per Area',         defaultChart: 'bar' },
  { key: 'headcount_sede',           label: 'Headcount per Sede',         defaultChart: 'bar' },
  { key: 'headcount_societa',        label: 'Headcount per Società',      defaultChart: 'pie' },
  { key: 'headcount_qualifica',      label: 'Headcount per Qualifica',    defaultChart: 'horizontal' },
  { key: 'headcount_livello',        label: 'Headcount per Livello',      defaultChart: 'bar' },
  { key: 'headcount_tipo_contratto', label: 'Per Tipo Contratto',         defaultChart: 'stack100' },
  { key: 'ral_area',                 label: 'RAL medio per Area (k€)',    defaultChart: 'horizontal' },
  { key: 'ral_livello',              label: 'RAL medio per Livello (k€)', defaultChart: 'bar' },
  { key: 'span_of_control',          label: 'Span of Control',            defaultChart: 'bar' },
  { key: 'depth_gerarchia',          label: 'Profondità Gerarchia',       defaultChart: 'bar' },
  { key: 'fte_funzione',             label: 'FTE per Funzione',           defaultChart: 'horizontal' },
  { key: 'part_time_dist',           label: 'Part-time vs Full-time',     defaultChart: 'stack100' },
  { key: 'tipo_nodo_dist',           label: 'Distribuzione Tipo Nodo',    defaultChart: 'pie' },
]

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: 'w1', metricKey: 'headcount_area',      chartType: 'bar',        title: 'Headcount per Area',      w: 6,  h: 1 },
  { id: 'w2', metricKey: 'headcount_societa',   chartType: 'pie',        title: 'Headcount per Società',   w: 6,  h: 1 },
  { id: 'w3', metricKey: 'tipo_nodo_dist',      chartType: 'pie',        title: 'Distribuzione Tipo Nodo', w: 4,  h: 1 },
  { id: 'w4', metricKey: 'span_of_control',     chartType: 'bar',        title: 'Span of Control',         w: 4,  h: 1 },
  { id: 'w5', metricKey: 'fte_funzione',        chartType: 'horizontal', title: 'FTE per Funzione',        w: 6,  h: 2 },
  { id: 'w6', metricKey: 'headcount_qualifica', chartType: 'horizontal', title: 'Headcount per Qualifica', w: 6,  h: 1 },
]

function groupBy(arr: Record<string, unknown>[], key: string): { name: string; value: number }[] {
  const map = new Map<string, number>()
  for (const item of arr) {
    const k = (item[key] as string | null) ?? '(non definito)'
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

function avgBy(arr: Record<string, unknown>[], groupKey: string, valueKey: string): { name: string; value: number }[] {
  const sums = new Map<string, { sum: number; count: number }>()
  for (const item of arr) {
    const k = (item[groupKey] as string | null) ?? '(non definito)'
    const v = item[valueKey] as number | null
    if (v == null) continue
    const cur = sums.get(k) ?? { sum: 0, count: 0 }
    sums.set(k, { sum: cur.sum + v, count: cur.count + 1 })
  }
  return [...sums.entries()]
    .map(([name, { sum, count }]) => ({ name, value: Math.round((sum / count) / 1000 * 10) / 10 }))
    .sort((a, b) => b.value - a.value)
}

export default function DashboardView() {
  const { persone, nodi, timesheet } = useHRStore()
  const [widgets, setWidgets] = usePersistedState<WidgetConfig[]>('hr-dashboard-widgets-v3', DEFAULT_WIDGETS)
  const [showModal, setShowModal] = useState(false)
  const [newMetric, setNewMetric] = useState<MetricKey>('headcount_area')
  const [newChart, setNewChart] = useState<ChartType>('bar')
  const [newW, setNewW] = useState<WidgetW>(6)
  const [newH, setNewH] = useState<WidgetH>(1)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const activePersone = useMemo(() => persone.filter(p => !p.deleted_at), [persone])
  const activeNodi = useMemo(() => nodi.filter(n => !n.deleted_at), [nodi])

  const kpi = useMemo(() => {
    const totalFte = activeNodi.reduce((s, n) => s + (n.fte ?? 0), 0)
    const ralValues = activePersone.map(p => p.ral).filter((v): v is number => v != null)
    const avgRal = ralValues.length > 0 ? ralValues.reduce((s, v) => s + v, 0) / ralValues.length : 0
    const today = new Date().toISOString().slice(0, 10)
    const withSupervisor = new Set(
      timesheet.filter(t => t.cf_supervisore && (!t.data_fine || t.data_fine >= today)).map(t => t.cf_dipendente)
    )
    const pctSupervisor = activePersone.length > 0
      ? Math.round((activePersone.filter(p => withSupervisor.has(p.cf)).length / activePersone.length) * 100)
      : 0
    const strutture = activeNodi.filter(n => n.tipo_nodo === 'STRUTTURA')
    const reportCounts = new Map<string, number>()
    for (const n of activeNodi) {
      if (n.reports_to) reportCounts.set(n.reports_to, (reportCounts.get(n.reports_to) ?? 0) + 1)
    }
    const spansArr = strutture.map(s => reportCounts.get(s.id) ?? 0).filter(v => v > 0)
    const avgSpan = spansArr.length > 0 ? Math.round((spansArr.reduce((s, v) => s + v, 0) / spansArr.length) * 10) / 10 : 0
    return {
      personeAttive: activePersone.length,
      totaleNodi: activeNodi.length,
      totaleFte: Math.round(totalFte * 10) / 10,
      ralMedio: avgRal > 0 ? `€${Math.round(avgRal / 1000)}k` : '—',
      pctSupervisor: `${pctSupervisor}%`,
      spanOfControl: avgSpan || '—',
    }
  }, [activePersone, activeNodi, timesheet])

  const metricsMap = useMemo(() => {
    const map = new Map<MetricKey, { name: string; value: number }[]>()
    const asRecord = (arr: unknown[]) => arr as Record<string, unknown>[]

    map.set('headcount_area',           groupBy(asRecord(activePersone), 'area'))
    map.set('headcount_sede',           groupBy(asRecord(activePersone), 'sede'))
    map.set('headcount_societa',        groupBy(asRecord(activePersone), 'societa'))
    map.set('headcount_qualifica',      groupBy(asRecord(activePersone), 'qualifica'))
    map.set('headcount_livello',        groupBy(asRecord(activePersone), 'livello'))
    map.set('headcount_tipo_contratto', groupBy(asRecord(activePersone), 'tipo_contratto'))
    map.set('ral_area',                 avgBy(asRecord(activePersone), 'area', 'ral'))
    map.set('ral_livello',              avgBy(asRecord(activePersone), 'livello', 'ral'))
    map.set('tipo_nodo_dist',           groupBy(asRecord(activeNodi), 'tipo_nodo'))

    const ptMap = new Map<string, number>()
    for (const p of activePersone) {
      const k = (p.part_time != null && p.part_time < 100) ? 'Part-time' : 'Full-time'
      ptMap.set(k, (ptMap.get(k) ?? 0) + 1)
    }
    map.set('part_time_dist', [...ptMap.entries()].map(([name, value]) => ({ name, value })))

    const fteMap = new Map<string, number>()
    for (const n of activeNodi) {
      const k = n.funzione ?? '(non definita)'
      fteMap.set(k, (fteMap.get(k) ?? 0) + (n.fte ?? 0))
    }
    map.set('fte_funzione', [...fteMap.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 }))
      .sort((a, b) => b.value - a.value))

    const reportCounts = new Map<string, number>()
    for (const n of activeNodi) {
      if (n.reports_to) reportCounts.set(n.reports_to, (reportCounts.get(n.reports_to) ?? 0) + 1)
    }
    const binMap = new Map<string, number>()
    for (const [, count] of reportCounts) {
      const bin = `${count} report${count !== 1 ? 's' : ''}`
      binMap.set(bin, (binMap.get(bin) ?? 0) + 1)
    }
    map.set('span_of_control', [...binMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name)))

    const childrenMap = new Map<string | null, string[]>()
    for (const n of activeNodi) {
      const p = n.reports_to ?? null
      if (!childrenMap.has(p)) childrenMap.set(p, [])
      childrenMap.get(p)!.push(n.id)
    }
    const depthCount = new Map<number, number>()
    const queue: [string, number][] = (childrenMap.get(null) ?? []).map(id => [id, 0])
    while (queue.length > 0) {
      const [id, depth] = queue.shift()!
      depthCount.set(depth, (depthCount.get(depth) ?? 0) + 1)
      for (const child of childrenMap.get(id) ?? []) queue.push([child, depth + 1])
    }
    map.set('depth_gerarchia', [...depthCount.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, value]) => ({ name: `Livello ${depth}`, value })))

    return map
  }, [activePersone, activeNodi])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = widgets.findIndex(w => w.id === active.id)
      const newIndex = widgets.findIndex(w => w.id === over.id)
      setWidgets(arrayMove(widgets, oldIndex, newIndex))
    }
  }

  const handleResize = (id: string, patch: Partial<Pick<WidgetConfig, 'w' | 'h'>>) => {
    setWidgets(widgets.map(w => w.id === id ? { ...w, ...patch } : w))
  }

  const handleAddWidget = () => {
    const def = METRIC_DEFS.find(d => d.key === newMetric)!
    setWidgets([...widgets, {
      id: crypto.randomUUID(),
      metricKey: newMetric,
      chartType: newChart,
      title: def.label,
      w: newW,
      h: newH,
    }])
    setShowModal(false)
  }

  const handleMetricChange = (key: MetricKey) => {
    setNewMetric(key)
    setNewChart(METRIC_DEFS.find(d => d.key === key)!.defaultChart)
  }

  const kpiCards = [
    { label: 'Persone attive',        value: kpi.personeAttive },
    { label: 'Totale nodi',           value: kpi.totaleNodi },
    { label: 'FTE totale',            value: kpi.totaleFte },
    { label: 'RAL medio',             value: kpi.ralMedio },
    { label: '% con supervisore',     value: kpi.pctSupervisor },
    { label: 'Span of control medio', value: kpi.spanOfControl },
  ]

  return (
    <div className="flex flex-col h-full overflow-auto bg-slate-950 p-4 gap-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpiCards.map(k => (
          <div key={k.label} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
            <div className="text-xs text-slate-400 mb-1">{k.label}</div>
            <div className="text-2xl font-semibold text-slate-100">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">
          Grafici
          <span className="ml-2 text-xs text-slate-600 font-normal">Trascina per riordinare · usa 1/4, 1/3, 1/2, 1/1 · altezza S/M/L</span>
        </span>
        <button
          onClick={() => { setNewMetric('headcount_area'); setNewChart('bar'); setNewW(6); setNewH(1); setShowModal(true) }}
          className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
        >
          + Aggiungi grafico
        </button>
      </div>

      {/* Widget grid — 12 colonne, span libero per widget */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1rem', alignItems: 'start' }}>
            {widgets.map(w => (
              <DashboardWidget
                key={w.id}
                config={w}
                data={metricsMap.get(w.metricKey as MetricKey) ?? []}
                onRemove={() => setWidgets(widgets.filter(x => x.id !== w.id))}
                onResize={patch => handleResize(w.id, patch)}
              />
            ))}
            {widgets.length === 0 && (
              <div style={{ gridColumn: 'span 12' }} className="text-center py-16 text-slate-500 text-sm">
                Nessun grafico. Clicca "+ Aggiungi grafico" per iniziare.
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-6 w-96 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-100 mb-4">Aggiungi grafico</h3>

            <div className="mb-3">
              <label className="block text-xs text-slate-400 mb-1">Metrica</label>
              <select
                value={newMetric}
                onChange={e => handleMetricChange(e.target.value as MetricKey)}
                className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 outline-none"
              >
                {METRIC_DEFS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-slate-400 mb-1">Tipo grafico</label>
              <select
                value={newChart}
                onChange={e => setNewChart(e.target.value as ChartType)}
                className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 outline-none"
              >
                <option value="bar">Barre verticali</option>
                <option value="horizontal">Barre orizzontali</option>
                <option value="pie">Torta</option>
                <option value="stack100">Stack 100%</option>
              </select>
            </div>

            <div className="mb-3 flex gap-3">
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Larghezza</label>
                <select
                  value={newW}
                  onChange={e => setNewW(Number(e.target.value) as WidgetW)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 outline-none"
                >
                  <option value={3}>1/4</option>
                  <option value={4}>1/3</option>
                  <option value={6}>1/2</option>
                  <option value={12}>Piena</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Altezza</label>
                <select
                  value={newH}
                  onChange={e => setNewH(Number(e.target.value) as WidgetH)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-sm text-slate-100 outline-none"
                >
                  <option value={1}>S (compact)</option>
                  <option value={2}>M (standard)</option>
                  <option value={3}>L (tall)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">
                Annulla
              </button>
              <button onClick={handleAddWidget} className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors">
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
