import { CircleCheck, CloudOff, Lock, RefreshCw, TriangleAlert } from 'lucide-react'
import { useOptionalSyncStatus } from '@/sync/context'
import { cn } from '@/lib/cn'

/** Indicateur permanent : synchronisé / en cours / hors ligne (avec le nombre d'éléments en attente). */
export function SyncIndicator() {
  const s = useOptionalSyncStatus()
  if (!s) return null
  const pending = s.pending > 0 ? ` · ${s.pending} en attente` : ''
  const map = {
    idle: {
      icon: CircleCheck,
      text: s.pending > 0 ? `En attente${pending}` : 'Synchronisé',
      tone: s.pending > 0 ? 'bg-accent-100 text-accent-900' : 'bg-brand-100 text-brand-900',
    },
    syncing: {
      icon: RefreshCw,
      text: `Synchronisation…${pending}`,
      tone: 'bg-sky-100 text-sky-900',
    },
    offline: {
      icon: CloudOff,
      text: `Hors ligne${pending}`,
      tone: 'bg-accent-100 text-accent-900',
    },
    error: { icon: TriangleAlert, text: `Problème${pending}`, tone: 'bg-red-100 text-red-900' },
    blocked: { icon: Lock, text: 'Suspendu', tone: 'bg-red-100 text-red-900' },
  }[s.state]
  const Icon = map.icon
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold',
        map.tone,
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4',
          s.state === 'syncing' && 'animate-spin motion-reduce:animate-none',
        )}
        aria-hidden="true"
      />
      {map.text}
    </span>
  )
}
