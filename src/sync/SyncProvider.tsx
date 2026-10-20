import { useEffect, useMemo, type ReactNode } from 'react'
import { useAuth, useSession } from '@/auth/context'
import { SyncContext } from './context'
import { APP_VERSION } from './version'
import { supabaseRemote } from './supabaseRemote'
import { SyncEngine } from './engine'
import { startSyncTriggers } from './triggers'

/** Crée le moteur de sync de la session et branche ses déclencheurs (démarrage, écritures, réseau, minuterie). */
export function SyncProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const { supabase } = useAuth()
  const engine = useMemo(
    () =>
      new SyncEngine({
        db: session.db,
        remote: supabaseRemote(supabase),
        shopId: session.profile.shop_id,
        role: session.profile.role,
        appVersion: APP_VERSION,
      }),
    [session.db, session.profile.shop_id, session.profile.role, supabase],
  )
  useEffect(() => {
    const stop = startSyncTriggers(engine, session.db)
    return () => {
      stop()
      engine.dispose()
    }
  }, [engine, session.db])
  return <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>
}
