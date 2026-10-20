import { createClient } from '@supabase/supabase-js'
import type { Env } from '@/config/env'

/** Client Supabase du navigateur (clé publique uniquement). Sert à l'authentification et au moteur de sync. */
export function createSupabase(env: Env) {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 0 } },
  })
}
