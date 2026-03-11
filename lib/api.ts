import type {
  NodoOrganigramma, Persona, SupervisioneTimesheet, RuoloTns, StrutturaTns,
  ChangeLogEntry, ImportReport, VariabileOrgDefinizione, VariabileOrgValore, CleaningProposal
} from '../types'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

function u(path: string) { return `${BASE}${path}` }

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text)
  }
  return res.json() as Promise<T>
}

export const api = {
  org: {
    list: (showDeleted = false, includeVars = false): Promise<NodoOrganigramma[]> =>
      fetch(u(`/api/org?showDeleted=${showDeleted}&includeVars=${includeVars}`)).then(r => json(r)),

    tree: (): Promise<NodoOrganigramma[]> =>
      fetch(u('/api/org/tree')).then(r => json(r)),

    get: (id: string): Promise<NodoOrganigramma | null> =>
      fetch(u(`/api/org/${encodeURIComponent(id)}`)).then(r => r.status === 404 ? null : json(r)),

    create: (data: Partial<NodoOrganigramma>): Promise<{ success: boolean; error?: string }> =>
      fetch(u('/api/org'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    update: (id: string, data: Partial<NodoOrganigramma>): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/org/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    delete: (id: string): Promise<{ success: boolean; message?: string }> =>
      fetch(u(`/api/org/${encodeURIComponent(id)}`), { method: 'DELETE' }).then(r => json(r)),

    restore: (id: string): Promise<{ success: boolean }> =>
      fetch(u(`/api/org/${encodeURIComponent(id)}/restore`), { method: 'POST' }).then(r => json(r)),
  },

  persone: {
    list: (showDeleted = false): Promise<Persona[]> =>
      fetch(u(`/api/persone?showDeleted=${showDeleted}`)).then(r => json(r)),

    get: (cf: string): Promise<Persona | null> =>
      fetch(u(`/api/persone/${encodeURIComponent(cf)}`)).then(r => r.status === 404 ? null : json(r)),

    create: (data: Partial<Persona>): Promise<{ success: boolean; error?: string }> =>
      fetch(u('/api/persone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    update: (cf: string, data: Partial<Persona>): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/persone/${encodeURIComponent(cf)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    delete: (cf: string): Promise<{ success: boolean }> =>
      fetch(u(`/api/persone/${encodeURIComponent(cf)}`), { method: 'DELETE' }).then(r => json(r)),

    restore: (cf: string): Promise<{ success: boolean }> =>
      fetch(u(`/api/persone/${encodeURIComponent(cf)}/restore`), { method: 'POST' }).then(r => json(r)),
  },

  timesheet: {
    list: (): Promise<SupervisioneTimesheet[]> =>
      fetch(u('/api/timesheet')).then(r => json(r)),

    get: (cf: string): Promise<SupervisioneTimesheet | null> =>
      fetch(u(`/api/timesheet/${encodeURIComponent(cf)}`)).then(r => r.status === 404 ? null : json(r)),

    delete: (cf: string, hard = false): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/timesheet/${encodeURIComponent(cf)}${hard ? '?hard=true' : ''}`), { method: 'DELETE' }).then(r => json(r)),
  },

  tns: {
    list: (): Promise<RuoloTns[]> =>
      fetch(u('/api/tns')).then(r => json(r)),

    get: (cf: string): Promise<RuoloTns | null> =>
      fetch(u(`/api/tns/${encodeURIComponent(cf)}`)).then(r => r.status === 404 ? null : json(r)),

    update: (cf: string, data: Partial<RuoloTns>): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/tns/${encodeURIComponent(cf)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    delete: (cf: string, hard = false): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/tns/${encodeURIComponent(cf)}${hard ? '?hard=true' : ''}`), { method: 'DELETE' }).then(r => json(r)),
  },

  changelog: {
    list: (filters: {
      search?: string
      entityType?: string
      action?: string
      dateFrom?: string
      dateTo?: string
      limit?: number
      offset?: number
    } = {}): Promise<ChangeLogEntry[]> => {
      const params = new URLSearchParams()
      if (filters.search) params.set('search', filters.search)
      if (filters.entityType && filters.entityType !== 'all') params.set('entityType', filters.entityType)
      if (filters.action && filters.action !== 'all') params.set('action', filters.action)
      if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
      if (filters.dateTo) params.set('dateTo', filters.dateTo)
      if (filters.limit !== undefined) params.set('limit', String(filters.limit))
      if (filters.offset !== undefined) params.set('offset', String(filters.offset))
      return fetch(u(`/api/changelog?${params}`)).then(r => json(r))
    },

    exportCsv: async (): Promise<void> => {
      const res = await fetch(u('/api/changelog/export-csv'))
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const now = new Date()
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      a.href = url
      a.download = `storico_${dateStr}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
  },

  stats: {
    counts: (): Promise<{ nodi: number; persone: number; timesheet: number; tns: number; struttureTns: number }> =>
      fetch(u('/api/stats/counts')).then(r => json(r)),
  },

  variabili: {
    listDefinizioni: (): Promise<VariabileOrgDefinizione[]> =>
      fetch(u('/api/variabili/definizioni')).then(r => json(r)),

    createDefinizione: (data: Partial<VariabileOrgDefinizione>): Promise<{ success: boolean; id?: number; error?: string }> =>
      fetch(u('/api/variabili/definizioni'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    updateDefinizione: (id: number, data: Partial<VariabileOrgDefinizione>): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/variabili/definizioni/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    deleteDefinizione: (id: number): Promise<{ success: boolean; error?: string; count?: number }> =>
      fetch(u(`/api/variabili/definizioni/${id}`), { method: 'DELETE' }).then(r => json(r)),

    getValori: (entitaTipo: string, entitaId: string): Promise<(VariabileOrgValore & { nome: string; label: string; tipo: string })[]> =>
      fetch(u(`/api/variabili/valori/${encodeURIComponent(entitaTipo)}/${encodeURIComponent(entitaId)}`)).then(r => json(r)),

    setValue: (entitaTipo: string, entitaId: string, varId: number, valore: string | null): Promise<{ success: boolean }> =>
      fetch(u('/api/variabili/valori'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entita_tipo: entitaTipo, entita_id: entitaId, var_id: varId, valore })
      }).then(r => json(r)),
  },

  struttureTns: {
    list: (): Promise<StrutturaTns[]> =>
      fetch(u('/api/strutture-tns')).then(r => json(r)),

    get: (codice: string): Promise<StrutturaTns | null> =>
      fetch(u(`/api/strutture-tns/${encodeURIComponent(codice)}`)).then(r => r.status === 404 ? null : json(r)),

    create: (data: Partial<StrutturaTns>): Promise<{ success: boolean; error?: string }> =>
      fetch(u('/api/strutture-tns'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    update: (codice: string, data: Partial<StrutturaTns>): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/strutture-tns/${encodeURIComponent(codice)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    delete: (codice: string): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/strutture-tns/${encodeURIComponent(codice)}`), { method: 'DELETE' }).then(r => json(r)),
  },

  dataCleaning: {
    proposals: (): Promise<CleaningProposal[]> =>
      fetch(u('/api/data-cleaning/proposals')).then(r => json(r)),

    bulkUpdate: (body: {
      entityType: 'persone' | 'nodi' | 'strutture-tns'
      ids: string[]
      field: string
      value: string | null
    }): Promise<{ updated: number; errors: string[] }> =>
      fetch(u('/api/data-cleaning/bulk-update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => json(r)),

    merge: (body: {
      entityType: 'persone' | 'nodi' | 'strutture-tns'
      survivorId: string
      victimId: string
      overrideFields?: Record<string, unknown>
    }): Promise<{ success: boolean; error?: string }> =>
      fetch(u('/api/data-cleaning/merge'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(r => json(r)),
  },

  import: {
    preview: async (file: File): Promise<{ sheetNames: string[]; headers: string[]; sampleRows: Record<string, unknown>[] }> => {
      const fd = new FormData()
      fd.append('file', file)
      return fetch(u('/api/import/preview'), { method: 'POST', body: fd }).then(r => json(r))
    },

    dryRun: async (options: {
      file: File
      entity: string
      mode: 'SOSTITUTIVA' | 'INTEGRATIVA'
      mapping: Record<string, string>
      sheetName: string
      keyField?: string
    }): Promise<{ toInsert: number; toUpdate: number; toSkip: number; anomalie: unknown[]; diff: unknown[] }> => {
      const fd = new FormData()
      fd.append('file', options.file)
      fd.append('entity', options.entity)
      fd.append('mode', options.mode)
      fd.append('mapping', JSON.stringify(options.mapping))
      fd.append('sheetName', options.sheetName)
      if (options.keyField) fd.append('keyField', options.keyField)
      return fetch(u('/api/import/dry-run'), { method: 'POST', body: fd }).then(r => json(r))
    },

    execute: async (options: {
      file: File
      entity: string
      mode: 'SOSTITUTIVA' | 'INTEGRATIVA'
      mapping: Record<string, string>
      sheetName: string
      keyField?: string
    }): Promise<ImportReport> => {
      const fd = new FormData()
      fd.append('file', options.file)
      fd.append('entity', options.entity)
      fd.append('mode', options.mode)
      fd.append('mapping', JSON.stringify(options.mapping))
      fd.append('sheetName', options.sheetName)
      if (options.keyField) fd.append('keyField', options.keyField)
      return fetch(u('/api/import/execute'), { method: 'POST', body: fd }).then(r => json(r))
    },
  },
}
