'use client'
import React, { useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import PosizioniCanvas from './orgchart/PosizioniCanvas'
import PersoneCanvas from './orgchart/PersoneCanvas'
import TnsCanvas from './orgchart/TnsCanvas'
import AccordionView from './AccordionView'
import { useHRStore } from '@/store/useHRStore'
import type { OrgSubTab } from '@/types'

const SUB_TABS: { id: OrgSubTab; label: string }[] = [
  { id: 'posizioni', label: 'Posizioni' },
  { id: 'persone', label: 'Persone / Timesheet' },
  { id: 'tns', label: 'TNS' },
  { id: 'accordion', label: 'Accordion' },
]

export default function OrgchartView() {
  const [subTab, setSubTab] = useState<OrgSubTab>('posizioni')
  const [mounted, setMounted] = useState<Set<OrgSubTab>>(new Set(['posizioni']))
  const { activeView } = useHRStore()

  // sync from store navigation
  React.useEffect(() => {
    if (activeView === 'posizioni') setSubTab('posizioni')
    else if (activeView === 'persone-ts') setSubTab('persone')
    else if (activeView === 'tns') setSubTab('tns')
    else if (activeView === 'accordion') setSubTab('accordion')
  }, [activeView])

  const handleTabChange = (tab: OrgSubTab) => {
    setSubTab(tab)
    setMounted(prev => new Set([...prev, tab]))
  }

  const vis = (tab: OrgSubTab) => subTab === tab ? 'h-full' : 'h-full hidden'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-900 border-b border-slate-700">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={[
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              subTab === tab.id
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {mounted.has('posizioni') && (
          <div className={vis('posizioni')}>
            <ReactFlowProvider>
              <PosizioniCanvas />
            </ReactFlowProvider>
          </div>
        )}
        {mounted.has('persone') && (
          <div className={vis('persone')}>
            <ReactFlowProvider>
              <PersoneCanvas />
            </ReactFlowProvider>
          </div>
        )}
        {mounted.has('tns') && (
          <div className={vis('tns')}>
            <ReactFlowProvider>
              <TnsCanvas />
            </ReactFlowProvider>
          </div>
        )}
        {mounted.has('accordion') && (
          <div className={vis('accordion')}>
            <AccordionView />
          </div>
        )}
      </div>
    </div>
  )
}
