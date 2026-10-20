import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSession } from '@/auth/context'
import { isManager } from '@/db/ctx'
import { EmptyState } from './EmptyState'

/** Écran réservé au propriétaire et au gérant (la vraie protection est dans la base : RLS). */
export function RequireManager({ children }: { children: ReactNode }) {
  const { ctx } = useSession()
  return isManager(ctx) ? (
    <>{children}</>
  ) : (
    <EmptyState
      icon={Lock}
      title="Écran réservé"
      description="Seuls le propriétaire et le gérant peuvent ouvrir cet écran."
    />
  )
}
