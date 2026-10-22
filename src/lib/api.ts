import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

const envelope = z.union([
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string(), message: z.string() }) }),
])

/** Appel d'une fonction serveur (/api) avec le jeton de l'utilisateur. Réponses validées par zod. */
export async function apiCall<T>(
  client: SupabaseClient,
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  try {
    const { data: session } = await client.auth.getSession()
    const token = session.session?.access_token
    if (!token) return { ok: false, code: 'unauthenticated', message: 'Veuillez vous reconnecter.' }
    const response = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body ?? {}),
    })
    const parsed = envelope.safeParse(await response.json())
    if (!parsed.success)
      return { ok: false, code: 'bad_response', message: 'Réponse inattendue du serveur.' }
    if (!parsed.data.ok) return { ok: false, ...parsed.data.error }
    const data = schema.safeParse(parsed.data.data)
    return data.success
      ? { ok: true, data: data.data }
      : { ok: false, code: 'bad_response', message: 'Réponse inattendue du serveur.' }
  } catch {
    return {
      ok: false,
      code: 'network',
      message: 'Pas de connexion internet. Réessayez quand le réseau revient.',
    }
  }
}

/** Appel d'une route PUBLIQUE de /api (sans compte), par exemple la demande d'inscription. Réponses validées par zod. */
export async function publicCall<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    const parsed = envelope.safeParse(await response.json())
    if (!parsed.success)
      return { ok: false, code: 'bad_response', message: 'Réponse inattendue du serveur.' }
    if (!parsed.data.ok) return { ok: false, ...parsed.data.error }
    const data = schema.safeParse(parsed.data.data)
    return data.success
      ? { ok: true, data: data.data }
      : { ok: false, code: 'bad_response', message: 'Réponse inattendue du serveur.' }
  } catch {
    return {
      ok: false,
      code: 'network',
      message: 'Pas de connexion internet. Réessayez quand le réseau revient.',
    }
  }
}
