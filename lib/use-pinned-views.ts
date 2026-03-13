'use client'
import { useState, useCallback, useEffect } from 'react'
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

  const isPinned = useCallback((id: string) => pins.some(p => p.id === id), [pins])

  return { pins, addPin, removePin, isPinned }
}
