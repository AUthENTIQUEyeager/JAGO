import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: string
}

interface TabsProps {
  tabs: readonly TabItem[]
  value: string
  onChange: (id: string) => void
  ariaLabel: string
  /** Préfixe unique pour relier chaque onglet à son panneau. */
  idPrefix: string
}

export function Tabs({ tabs, value, onChange, ariaLabel, idPrefix }: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1
    let next: number
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else return
    event.preventDefault()
    const target = tabs[next]
    if (!target) return
    onChange(target.id)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex gap-1 overflow-x-auto rounded-xl bg-neutral-200 p-1"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[index] = element
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(tab.id)
            }}
            onKeyDown={(event) => {
              onKeyDown(event, index)
            }}
            className={cn(
              'min-h-11 shrink-0 rounded-lg px-4 text-base font-semibold transition-colors',
              selected
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-neutral-800 hover:bg-neutral-100',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

interface TabPanelProps {
  idPrefix: string
  id: string
  active: boolean
  children: ReactNode
}

export function TabPanel({ idPrefix, id, active, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      hidden={!active}
    >
      {active ? children : null}
    </div>
  )
}
