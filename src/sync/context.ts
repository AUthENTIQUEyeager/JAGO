import { createContext, useContext, useSyncExternalStore } from 'react'
import type { SyncEngine, SyncStatus } from './engine'

export const SyncContext = createContext<SyncEngine | null>(null)

export function useSyncEngine(): SyncEngine {
  const engine = useContext(SyncContext)
  if (!engine) throw new Error('useSyncEngine doit être utilisé dans <SyncProvider>.')
  return engine
}

export function useSyncStatus(): SyncStatus {
  const engine = useSyncEngine()
  return useSyncExternalStore(engine.subscribe, engine.getStatus)
}

/** Version qui accepte l'absence de moteur (écrans testés isolément). */
export function useOptionalSyncStatus(): SyncStatus | null {
  const engine = useContext(SyncContext)
  return useSyncExternalStore(
    (listener) => (engine ? engine.subscribe(listener) : () => undefined),
    () => (engine ? engine.getStatus() : null),
  )
}
