'use client'
import React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, Moon, Sun, Building2 } from 'lucide-react'
import { useHRStore } from '@/store/useHRStore'
import type { ActiveSection, ActiveView } from '@/types'

interface MenuItemProps {
  label: string
  section: ActiveSection
  view: ActiveView
  onSelect: (section: ActiveSection, view: ActiveView) => void
  activeSection: ActiveSection
  activeView: ActiveView
}

function MenuItem({ label, section, view, onSelect, activeSection, activeView }: MenuItemProps) {
  const isActive = activeSection === section && activeView === view
  return (
    <DropdownMenu.Item
      onSelect={() => onSelect(section, view)}
      className={[
        'flex items-center px-3 py-2 text-sm cursor-pointer rounded outline-none transition-colors',
        isActive
          ? 'bg-indigo-600/20 text-indigo-300'
          : 'text-slate-300 hover:bg-slate-700 hover:text-slate-100'
      ].join(' ')}
    >
      {label}
    </DropdownMenu.Item>
  )
}

interface MenuButtonProps {
  label: string
  active: boolean
  children: React.ReactNode
}

function MenuButton({ label, active, children }: MenuButtonProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={[
            'flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors',
            active
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          ].join(' ')}
        >
          {label}
          <ChevronDown className="w-3 h-3" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[180px] bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-1 mt-1"
          sideOffset={4}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default function TopMenuBar() {
  const { activeSection, activeView, counts, setActiveSection, setActiveView } = useHRStore()
  const [dark, setDark] = React.useState(true)

  const nav = (section: ActiveSection, view: ActiveView) => {
    setActiveSection(section)
    setActiveView(view)
  }

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <header className="flex-none h-10 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-0.5 z-20">
      <div className="flex items-center gap-2 mr-4">
        <Building2 className="w-4 h-4 text-indigo-400" />
        <span className="font-semibold text-slate-200 text-sm whitespace-nowrap">HR Platform</span>
        <span className="text-slate-600 text-xs">·</span>
        <span className="text-slate-500 text-xs">Sole 24 Ore</span>
      </div>

      {counts && (
        <span className="text-xs text-slate-600 mr-3 hidden sm:block">
          {counts.nodi} nodi · {counts.persone} persone
        </span>
      )}

      <nav className="flex items-center gap-0.5">
        <MenuButton label="Organigramma" active={activeSection === 'organigramma'}>
          <MenuItem label="Posizioni" section="organigramma" view="posizioni" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Persone / Timesheet" section="organigramma" view="persone-ts" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="TNS" section="organigramma" view="tns" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Accordion" section="organigramma" view="accordion" onSelect={nav} activeSection={activeSection} activeView={activeView} />
        </MenuButton>

        <MenuButton label="Master Data" active={activeSection === 'masterdata'}>
          <MenuItem label="Nodi Organigramma" section="masterdata" view="nodi" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Persone" section="masterdata" view="persone" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Ruoli TNS" section="masterdata" view="ruoli-tns" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Strutture TNS" section="masterdata" view="strutture-tns" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Variabili Integrative" section="masterdata" view="variabili" onSelect={nav} activeSection={activeSection} activeView={activeView} />
        </MenuButton>

        <MenuButton label="Import" active={activeSection === 'import'}>
          <MenuItem label="Caricamento Iniziale" section="import" view="bulk" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Arricchimento Puntuale" section="import" view="enrich" onSelect={nav} activeSection={activeSection} activeView={activeView} />
        </MenuButton>

        <MenuButton label="Data Cleaning" active={activeSection === 'data-cleaning'}>
          <MenuItem label="Proposte" section="data-cleaning" view="dc-duplicati" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Modifica Massiva" section="data-cleaning" view="dc-bulk-edit" onSelect={nav} activeSection={activeSection} activeView={activeView} />
          <MenuItem label="Unisci Record" section="data-cleaning" view="dc-merge" onSelect={nav} activeSection={activeSection} activeView={activeView} />
        </MenuButton>

        <button
          onClick={() => { setActiveSection('storico'); setActiveView('nodi') }}
          className={[
            'px-3 py-1.5 text-sm rounded-md transition-colors',
            activeSection === 'storico'
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          ].join(' ')}
        >
          Storico
        </button>
      </nav>

      <div className="flex-1" />

      <button
        onClick={() => setDark(d => !d)}
        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
        title="Toggle dark mode"
      >
        {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </header>
  )
}
