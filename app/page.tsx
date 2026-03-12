'use client'
import React, { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import OrgchartView from '@/components/views/OrgchartView'
import AnagraficaView from '@/components/views/AnagraficaView'
import ImportBulkView from '@/components/views/ImportBulkView'
import ImportEnrichView from '@/components/views/ImportEnrichView'
import StoricoView from '@/components/views/StoricoView'
import DataCleaningView from '@/components/views/DataCleaningView'
import DbLiveView from '@/components/views/DbLiveView'
import { useHRStore } from '@/store/useHRStore'
import type { ActiveSection } from '@/types'

export default function Home() {
  const { activeSection, activeView, refreshAll } = useHRStore()
  const [mounted, setMounted] = useState<Set<ActiveSection>>(() => new Set([activeSection]))

  useEffect(() => {
    setMounted(prev => {
      if (prev.has(activeSection)) return prev
      return new Set([...prev, activeSection])
    })
  }, [activeSection])

  useEffect(() => {
    refreshAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const vis = (s: ActiveSection) => activeSection === s ? 'h-full' : 'h-full hidden'

  const ImportView = activeView === 'enrich' ? ImportEnrichView : ImportBulkView

  return (
    <AppShell>
      {mounted.has('organigramma') && <div className={vis('organigramma')}><OrgchartView /></div>}
      {mounted.has('masterdata') && <div className={vis('masterdata')}><AnagraficaView /></div>}
      {mounted.has('import') && <div className={vis('import')}><ImportView /></div>}
      {mounted.has('storico') && <div className={vis('storico')}><StoricoView /></div>}
      {mounted.has('data-cleaning') && <div className={vis('data-cleaning')}><DataCleaningView /></div>}
      {mounted.has('db-live') && <div className={vis('db-live')}><DbLiveView /></div>}
    </AppShell>
  )
}
