import type { ReactNode } from 'react'

export function PageHeader({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
        {hint ? <p className="text-base text-neutral-700">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-neutral-300 bg-white p-4 ${className}`}>
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'bad'
}) {
  const color =
    tone === 'good' ? 'text-brand-800' : tone === 'bad' ? 'text-red-800' : 'text-neutral-900'
  return (
    <Card>
      <p className="text-sm font-semibold text-neutral-700">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </Card>
  )
}
