import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-400 bg-white px-6 py-10 text-center">
      {Icon ? <Icon className="h-10 w-10 text-brand-700" aria-hidden="true" /> : null}
      <h2 className="text-lg font-bold text-neutral-900">{title}</h2>
      {description ? <p className="max-w-sm text-base text-neutral-700">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}
