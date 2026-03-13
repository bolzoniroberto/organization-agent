'use client'
import { useState, useCallback } from 'react'

export type DrillMode = 'navigate' | 'expand'

export function useOrgDrill() {
  const [drillRootId, setDrillRootId] = useState<string | null>(null)
  const [drillMode, setDrillMode] = useState<DrillMode>('navigate')

  const drillInto = useCallback((id: string, mode: DrillMode = 'navigate', onDone?: () => void) => {
    setDrillRootId(id)
    setDrillMode(mode)
    onDone?.()
  }, [])

  const drillTo = useCallback((id: string | null, onDone?: () => void) => {
    setDrillRootId(id)
    setDrillMode('navigate')
    onDone?.()
  }, [])

  return { drillRootId, drillMode, drillInto, drillTo }
}
