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

  const pinnedIds = useMemo(() => new Set(pins.map(p => p.id)), [pins])
  const isPinned = useCallback((id: string) => pinnedIds.has(id), [pinnedIds])

  return { pins, addPin, removePin, updatePin, isPinned }
}
