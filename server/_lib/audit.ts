import type { SupabaseClient } from '@supabase/supabase-js'

const FORBIDDEN_KEYS = /pass|secret|token|key/i

/** Retire tout ce qui ressemble à un secret : un mot de passe ne doit jamais atterrir dans le journal. */
export function scrub(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(details).filter(([key]) => !FORBIDDEN_KEYS.test(key)))
}

export async function audit(
  admin: SupabaseClient,
  entry: {
    userId: string
    shopId: string | null
    action: string
    details?: Record<string, unknown>
    reason?: string | null
  },
): Promise<void> {
  const { error } = await admin.from('audit_log').insert({
    admin_user_id: entry.userId,
    shop_id: entry.shopId,
    action: entry.action,
    details: scrub(entry.details ?? {}),
    reason: entry.reason ?? null,
  })
  if (error) throw new Error('audit_failed')
}
