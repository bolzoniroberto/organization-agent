'use client'
import { useState, useCallback, useEffect, useMemo } from 'react'
import type { PinnedView } from '@/types'

const KEY = 'org-pinned-views'

export function usePinnedViews() {
  const [pins, setPins] = useState<PinnedView[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(pins))
  }, [pins])

  const addPin = useCallback((pin: PinnedView) => {
    setPins(prev => [...prev.filter(p => p.id !== pin.id), pin])
  }, [])

  const removePin = useCallback((id: string) => {
    setPins(prev => prev.filter(p => p.id !== id))
  }, [])

  const updatePin = useCallback((id: string, patch: Partial<PinnedView>) => {
    setPins(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
  }, [])

  const reorderPins = useCallback((fromId: string, toId: string) => {
    setPins(prev => {
      const arr = [...prev]
      const fromIdx = arr.findIndex(p => p.id === fromId)
      const toIdx = arr.findIndex(p => p.id === toId)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev
      const [item] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, item)
      return arr
    })
  }, [])

  const pinnedIds = useMemo(() => new Set(pins.map(p => p.id)), [pins])
  const isPinned = useCallback((id: string) => pinnedIds.has(id), [pinnedIds])

  return { pins, addPin, removePin, updatePin, reorderPins, isPinned }
}
