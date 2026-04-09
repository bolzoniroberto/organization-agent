import type {
  NodoOrganigramma, Persona, SupervisioneTimesheet, StrutturaTns,
  ChangeLogEntry, ImportReport, VariabileOrgDefinizione, VariabileOrgValore, CleaningProposal,
  OrdineServizioAnalysis, OrdineServizioProposal, AgentNotification
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

    hardDelete: (id: string): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/org/${encodeURIComponent(id)}?hard=1`), { method: 'DELETE' }).then(r => json(r)),

    restore: (id: string): Promise<{ success: boolean }> =>
      fetch(u(`/api/org/${encodeURIComponent(id)}/restore`), { method: 'POST' }).then(r => json(r)),

    suggestId: (prefix: string): Promise<{ id?: string; error?: string }> =>
      fetch(u(`/api/org/suggest-id?prefix=${encodeURIComponent(prefix)}`)).then(r => json(r)),
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

    update: (cf: string, data: { cf_supervisore: string | null }): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/timesheet/${encodeURIComponent(cf)}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => json(r)),

    delete: (cf: string, hard = false): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/timesheet/${encodeURIComponent(cf)}${hard ? '?hard=true' : ''}`), { method: 'DELETE' }).then(r => json(r)),
  },

  tns: {
    list: (): Promise<Persona[]> =>
      fetch(u('/api/tns')).then(r => json(r)),

    get: (cf: string): Promise<Persona | null> =>
      fetch(u(`/api/tns/${encodeURIComponent(cf)}`)).then(r => r.status === 404 ? null : json(r)),

    update: (cf: string, data: Partial<Persona>): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/tns/${encodeURIComponent(cf)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(r => json(r)),

    deleteTns: (cf: string): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/tns/${encodeURIComponent(cf)}`), { method: 'DELETE' }).then(r => json(r)),
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

    listValori: (): Promise<VariabileOrgValore[]> =>
      fetch(u('/api/variabili/valori')).then(r => json(r)),

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
    list: (showDeleted = false): Promise<StrutturaTns[]> =>
      fetch(u(`/api/strutture-tns?showDeleted=${showDeleted}`)).then(r => json(r)),

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

    delete: (codice: string, force = false): Promise<{ success: boolean; error?: string; blocked?: boolean; childCount?: number; personCount?: number; subtreeCount?: number }> =>
      fetch(u(`/api/strutture-tns/${encodeURIComponent(codice)}${force ? '?force=true' : ''}`), { method: 'DELETE' }).then(r => json(r)),

    restore: (codice: string): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/strutture-tns/${encodeURIComponent(codice)}/restore`), { method: 'POST' }).then(r => json(r)),

    setParent: (codice: string, padre: string | null): Promise<{ success: boolean; error?: string }> =>
      fetch(u(`/api/strutture-tns/${encodeURIComponent(codice)}/parent`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ padre }),
      }).then(r => json(r)),

    listPersone: (codice: string): Promise<Persona[]> =>
      fetch(u(`/api/strutture-tns/${encodeURIComponent(codice)}/persone`)).then(r => json(r)),
  },

  db: {
    backup: (): Promise<{ success: boolean; file?: string; sizeKb?: number; totalBackups?: number; error?: string }> =>
      fetch(u('/api/db/backup'), { method: 'POST' }).then(r => json(r)),

    listBackups: (): Promise<{ backups: { name: string; sizeKb: number; createdAt: string }[] }> =>
      fetch(u('/api/db/backup')).then(r => json(r)),

    restore: (filename: string): Promise<{ success: boolean; safetyBackup?: string; error?: string }> =>
      fetch(u('/api/db/restore'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) }).then(r => json(r)),

    deleteBackup: (filename: string): Promise<{ success: boolean; error?: string }> =>
      fetch(u('/api/db/backup'), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename }) }).then(r => json(r)),
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

  agents: {
    analyzeOrdineServizio: async (input: { file?: File; prompt?: string }): Promise<OrdineServizioAnalysis> => {
      const fd = new FormData()
      if (input.file) fd.append('file', input.file)
      if (input.prompt) fd.append('prompt', input.prompt)
      return fetch(u('/api/agents/ordine-servizio'), { method: 'POST', body: fd }).then(r => json(r))
    },

    executeOrdineServizio: async (proposte: OrdineServizioProposal[]): Promise<{ applied: number; errors: string[] }> =>
      fetch(u('/api/agents/ordine-servizio/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposte }),
      }).then(r => json(r)),

    notifications: {
      list: (status: 'unread' | 'all' = 'all'): Promise<{ notifications: AgentNotification[]; unreadCount: number }> =>
        fetch(u(`/api/agents/notifications?status=${status}`)).then(r => json(r)),

      markRead: (id: string): Promise<{ success: boolean }> =>
        fetch(u('/api/agents/notifications'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'read' }),
        }).then(r => json(r)),

      dismiss: (id: string): Promise<{ success: boolean }> =>
        fetch(u('/api/agents/notifications'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, action: 'dismiss' }),
        }).then(r => json(r)),

      dismissAll: (): Promise<{ success: boolean }> =>
        fetch(u('/api/agents/notifications'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dismiss_all' }),
        }).then(r => json(r)),
    },


    scan: (): Promise<{ success: boolean; created: number; total: number; message: string }> =>
      fetch(u('/api/agents/scan'), { method: 'POST' }).then(r => json(r)),

    chat: {
      history: (limit = 50): Promise<{ messages: { id: string; role: string; content: string; metadata?: string; created_at: string }[] }> =>
        fetch(u(`/api/agents/chat?limit=${limit}`)).then(r => json(r)),

      send: (message: string): Promise<{ response: string; toolCalls?: { name: string; input: string; output: string }[]; proposals?: OrdineServizioProposal[]; messageId: string }> =>
        fetch(u('/api/agents/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message }),
        }).then(r => json(r)),

      clear: (): Promise<{ success: boolean }> =>
        fetch(u('/api/agents/chat'), { method: 'DELETE' }).then(r => json(r)),
    },
  },

  export: {
    orgPlus: {
      validate: (): Promise<{ errors: Record<string, unknown>[]; warnings: Record<string, unknown>[] }> =>
        fetch(u('/api/export/org-plus?validate=1')).then(r => json(r)),

      download: async (): Promise<void> => {
        const res = await fetch(u('/api/export/org-plus'))
        if (!res.ok) throw new Error(await res.text())
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const now = new Date()
        const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
        a.href = url
        a.download = `Gruppo_Il_Sole_24_ORE_Per_ORG_PLUS_${d}.xlsx`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      },
    },

    tnsOrg: {
      validate: (): Promise<{ errors: Record<string, unknown>[]; warnings: Record<string, unknown>[] }> =>
        fetch(u('/api/export/tns-org?validate=1')).then(r => json(r)),

      download: async (): Promise<void> => {
        const res = await fetch(u('/api/export/tns-org'))
        if (!res.ok) throw new Error(await res.text())
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const now = new Date()
        const d = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
        a.href = url
        a.download = `TNS24_Gruppo_Il_Sole_24_ORE_ORG_PLUS_${d}.xlsx`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      },
    },
  },

  settings: {
    get: (): Promise<{ settings: Record<string, string> }> =>
      fetch(u('/api/settings')).then(r => json(r)),

    set: (key: string, value: string): Promise<{ success: boolean }> =>
      fetch(u('/api/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      }).then(r => json(r)),

    discrete: (): Promise<{ fields: { table: string; field: string; label: string; entity: string; values: string[] }[] }> =>
      fetch(u('/api/settings/discrete')).then(r => json(r)),

    renameDiscreteValue: (table: string, field: string, old_value: string, new_value: string): Promise<{ updated: number; error?: string }> =>
      fetch(u('/api/settings/discrete/rename'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table, field, old_value, new_value }),
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
    }): Promise<{ toInsert: number; toUpdate: number; toSkip: number; toVarUpdate: number; anomalie: unknown[]; diff: unknown[] }> => {
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

    tns: async (file: File): Promise<ImportReport> => {
      const fd = new FormData()
      fd.append('file', file)
      return fetch(u('/api/import/tns'), { method: 'POST', body: fd }).then(r => json(r))
    },

    verificaDipendenti: {
      analyze: async (file: File): Promise<unknown> => {
        const fd = new FormData()
        fd.append('file', file)
        return fetch(u('/api/import/verifica-dipendenti'), { method: 'POST', body: fd }).then(r => json(r))
      },

      execute: async (persone: unknown[]): Promise<unknown> =>
        fetch(u('/api/import/verifica-dipendenti/execute'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ persone }),
        }).then(r => json(r)),

      elimina: async (cfs: string[], decorrenza: string): Promise<unknown> =>
        fetch(u('/api/import/verifica-dipendenti/elimina'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cfs, decorrenza }),
        }).then(r => json(r)),
    },

    schedaMovimento: {
      parse: async (file: File): Promise<{ parsed: unknown; cfExists: boolean; cfDeleted: boolean }> => {
        const fd = new FormData()
        fd.append('file', file)
        return fetch(u('/api/import/scheda-movimento'), { method: 'POST', body: fd }).then(r => json(r))
      },

      execute: async (body: unknown): Promise<{ success: boolean; actions: string[]; error?: string }> =>
        fetch(u('/api/import/scheda-movimento/execute'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).then(r => json(r)),
    },
  },
}
