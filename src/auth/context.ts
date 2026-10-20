import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'
import type { Env } from '@/config/env'
import type { AuthState, ReadySession } from './types'

export const GENERIC_LOGIN_ERROR = 'Identifiant ou mot de passe incorrect.'

export interface AuthApi {
  state: AuthState
  supabase: SupabaseClient
  env: Env
  signIn: (identifier: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  /** Efface la base locale de cet appareil : refusé s'il reste des éléments non envoyés. */
  wipeLocalData: () => Promise<string | null>
  refresh: () => Promise<void>
  loginWait: () => number
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const api = useContext(AuthContext)
  if (!api) throw new Error('useAuth doit être utilisé dans <AuthProvider>.')
  return api
}

/** Session prête (utilisateur connecté, base locale ouverte). À n'utiliser que sous la barrière d'authentification. */
export function useSession(): ReadySession {
  const { state } = useAuth()
  if (state.status !== 'ready') throw new Error('Aucune session active.')
  return state
}

/** Version qui accepte l'absence de fournisseur (écrans testés isolément). */
export function useOptionalAuth(): AuthApi | null {
  return useContext(AuthContext)
}
