'use client'
import { useState, useCallback } from 'react'

export function usePersistedState<T>(key: string, defaultValue: T): [T, (v: T) => void] {
  const [state, setStateRaw] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const setState = useCallback((v: T) => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* ignore */ }
    setStateRaw(v)
  }, [key])

  return [state, setState]
}
