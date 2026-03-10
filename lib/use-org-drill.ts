'use client'
import { useState, useCallback } from 'react'

export interface DrillItem {
  id: string | null
  label: string
}

export function useOrgDrill() {
  const [drillPath, setDrillPath] = useState<DrillItem[]>([{ id: null, label: 'Radice' }])

  const drillRootId = drillPath[drillPath.length - 1].id

  const drillInto = useCallback((id: string, label: string, onDone?: () => void) => {
    setDrillPath(prev => [...prev, { id, label }])
    onDone?.()
  }, [])

  const drillTo = useCallback((index: number, onDone?: () => void) => {
    setDrillPath(prev => prev.slice(0, index + 1))
    onDone?.()
  }, [])

  return { drillPath, drillRootId, drillInto, drillTo }
}
