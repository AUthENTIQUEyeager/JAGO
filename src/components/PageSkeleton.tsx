import { fr } from '@/i18n/fr'
import { Skeleton } from './Skeleton'

/** Affiché pendant le chargement d’un écran (routes chargées à la demande). */
export function PageSkeleton() {
  return (
    <div role="status" aria-label={fr.common.loading} className="space-y-4">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  )
}
