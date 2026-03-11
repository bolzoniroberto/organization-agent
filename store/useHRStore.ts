import { create } from 'zustand'
import { api } from '../lib/api'
import type {
  NodoOrganigramma, Persona, SupervisioneTimesheet, RuoloTns, StrutturaTns,
  ActiveSection, ActiveView, VariabileOrgDefinizione, VariabileOrgValore
} from '../types'

interface HRStore {
  activeSection: ActiveSection
  activeView: ActiveView
  setActiveSection: (s: ActiveSection) => void
  setActiveView: (v: ActiveView) => void

  nodi: NodoOrganigramma[]
  persone: Persona[]
  timesheet: SupervisioneTimesheet[]
  tns: RuoloTns[]
  struttureTns: StrutturaTns[]
  variabiliDef: VariabileOrgDefinizione[]
  variabiliValori: VariabileOrgValore[]
  counts: { nodi: number; persone: number; timesheet: number; tns: number; struttureTns: number } | null

  loading: boolean
  setLoading: (v: boolean) => void

  toast: { message: string; type: 'success' | 'error' | 'warning' | 'info' } | null
  showToast: (message: string, type?: 'success' | 'error' | 'warning') => void
  clearToast: () => void

  refreshNodi: (showDeleted?: boolean) => Promise<void>
  refreshPersone: (showDeleted?: boolean) => Promise<void>
  refreshTimesheet: () => Promise<void>
  refreshTns: () => Promise<void>
  refreshStruttureTns: () => Promise<void>
  refreshVariabiliDef: () => Promise<void>
  refreshVariabiliValori: () => Promise<void>
  refreshCounts: () => Promise<void>
  refreshAll: () => Promise<void>
}

export const useHRStore = create<HRStore>((set, get) => ({
  activeSection: 'organigramma',
  activeView: 'posizioni',
  setActiveSection: (s) => set({ activeSection: s }),
  setActiveView: (v) => set({ activeView: v }),

  nodi: [],
  persone: [],
  timesheet: [],
  tns: [],
  struttureTns: [],
  variabiliDef: [],
  variabiliValori: [],
  counts: null,
  loading: false,

  setLoading: (v) => set({ loading: v }),

  toast: null,
  showToast: (message, type = 'success') => {
    set({ toast: { message, type } })
    setTimeout(() => get().clearToast(), 3500)
  },
  clearToast: () => set({ toast: null }),

  refreshNodi: async (showDeleted = false) => {
    const nodi = await api.org.list(showDeleted)
    set({ nodi })
  },

  refreshPersone: async (showDeleted = false) => {
    const persone = await api.persone.list(showDeleted)
    set({ persone })
  },

  refreshTimesheet: async () => {
    const timesheet = await api.timesheet.list()
    set({ timesheet })
  },

  refreshTns: async () => {
    const tns = await api.tns.list()
    set({ tns })
  },

  refreshStruttureTns: async () => {
    const struttureTns = await api.struttureTns.list()
    set({ struttureTns })
  },

  refreshVariabiliDef: async () => {
    const variabiliDef = await api.variabili.listDefinizioni()
    set({ variabiliDef })
  },

  refreshVariabiliValori: async () => {
    const variabiliValori = await api.variabili.listValori()
    set({ variabiliValori })
  },

  refreshCounts: async () => {
    const counts = await api.stats.counts()
    set({ counts })
  },

  refreshAll: async () => {
    set({ loading: true })
    try {
      const [nodi, persone, timesheet, tns, struttureTns, counts, variabiliDef, variabiliValori] = await Promise.all([
        api.org.list(false),
        api.persone.list(false),
        api.timesheet.list(),
        api.tns.list(),
        api.struttureTns.list(),
        api.stats.counts(),
        api.variabili.listDefinizioni(),
        api.variabili.listValori(),
      ])
      set({ nodi, persone, timesheet, tns, struttureTns, counts, variabiliDef, variabiliValori })
    } finally {
      set({ loading: false })
    }
  },
}))
