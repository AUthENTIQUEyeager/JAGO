import type { RemoteError } from './remote'

export type ErrorClass = 'network' | 'auth' | 'rls' | 'duplicate' | 'fk' | 'transient' | 'permanent'

/** Classement des erreurs (voir docs/ARCHITECTURE.md §5). */
export function classify(error: RemoteError): ErrorClass {
  if (error.network) return 'network'
  if (error.status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') return 'auth'
  if (error.code === '42501' || error.status === 403) return 'rls'
  if (error.code === '23505') return 'duplicate'
  if (error.code === '23503') return 'fk'
  if (
    error.status !== null &&
    (error.status >= 500 || error.status === 429 || error.status === 408)
  )
    return 'transient'
  return 'permanent'
}

/** Attente avant un nouvel essai : 2 s, 4 s, 8 s… jusqu'à 5 minutes. */
export function nextBackoff(previousMs: number): number {
  return Math.min(Math.max(2000, previousMs * 2), 300_000)
}
