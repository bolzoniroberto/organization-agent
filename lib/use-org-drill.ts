'use client'
import { useState, useCallback } from 'react'

export interface DrillItem {
  id: string | null
  label: string
}

export type DrillMode = 'navigate' | 'expand'

export function useOrgDrill() {
  const [drillPath, setDrillPath] = useState<DrillItem[]>([{ id: null, label: 'Radice' }])
  const [drillMode, setDrillMode] = useState<DrillMode>('navigate')

  const drillRootId = drillPath[drillPath.length - 1].id

  const drillInto = useCallback((id: string, label: string, mode: DrillMode = 'navigate', onDone?: () => void) => {
    setDrillPath(prev => [...prev, { id, label }])
    setDrillMode(mode)
    onDone?.()
  }, [])

  const drillTo = useCallback((index: number, onDone?: () => void) => {
    setDrillPath(prev => prev.slice(0, index + 1))
    setDrillMode('navigate')
    onDone?.()
  }, [])

  return { drillPath, drillRootId, drillMode, drillInto, drillTo }
}
