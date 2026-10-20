import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/** Client à droits complets (clé service). Existe uniquement côté serveur : jamais dans le navigateur. */
export function getAdmin(): SupabaseClient {
  if (client) return client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Configuration serveur incomplète')
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

export const authEmailDomain = (): string => process.env.AUTH_EMAIL_DOMAIN ?? 'shops.jago.app'
