import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-200 text-neutral-900',
  success: 'bg-brand-100 text-brand-900',
  warning: 'bg-accent-100 text-accent-900',
  danger: 'bg-red-100 text-red-900',
  info: 'bg-sky-100 text-sky-900',
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}
