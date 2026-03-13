'use client'
import React, { useState } from 'react'
import AccordionView from './AccordionView'
import AccordionTnsView from './AccordionTnsView'
import AccordionResponsabiliView from './AccordionResponsabiliView'
import { useHRStore } from '@/store/useHRStore'

type SubTab = 'accordion-uo' | 'accordion-tns' | 'accordion-responsabili'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'accordion-uo', label: 'Unità Organizzative' },
  { id: 'accordion-tns', label: 'TNS' },
  { id: 'accordion-responsabili', label: 'Responsabili' },
]

export default function AccordionSectionView() {
  const { activeView, setActiveView } = useHRStore()
  const [mounted, setMounted] = useState<Set<SubTab>>(() => {
    const v = activeView as SubTab
    return new Set([SUB_TABS.some(t => t.id === v) ? v : 'accordion-uo'])
  })

  const current: SubTab = (SUB_TABS.some(t => t.id === activeView) ? activeView : 'accordion-uo') as SubTab

  const handleTab = (tab: SubTab) => {
    setMounted(prev => new Set([...prev, tab]))
    setActiveView(tab)
  }

  const vis = (tab: SubTab) => current === tab ? 'h-full' : 'h-full hidden'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-900 border-b border-slate-700">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTab(tab.id)}
            className={[
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              current === tab.id
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-700'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {mounted.has('accordion-uo') && (
          <div className={vis('accordion-uo')}><AccordionView /></div>
        )}
        {mounted.has('accordion-tns') && (
          <div className={vis('accordion-tns')}><AccordionTnsView /></div>
        )}
        {mounted.has('accordion-responsabili') && (
          <div className={vis('accordion-responsabili')}><AccordionResponsabiliView /></div>
        )}
      </div>
    </div>
  )
}
