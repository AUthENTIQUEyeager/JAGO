import { z } from 'zod'

/** Rôle lu dans le jeton (JWT) d’une clé Supabase, ou null si ce n’est pas un jeton lisible. */
const jwtPayloadSchema = z.object({ role: z.string().optional() })

function jwtRole(token: string): string | null {
  const parts = token.split('.')
  const payload = parts[1]
  if (parts.length !== 3 || !payload) return null
  try {
    const base64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const decoded = jwtPayloadSchema.safeParse(JSON.parse(atob(base64)))
    return decoded.success ? (decoded.data.role ?? null) : null
  } catch {
    return null
  }
}

/**
 * Détecte une clé secrète Supabase (rôle « service » ou clé « sb_secret_… »).
 * On teste le préfixe plutôt que le nom complet : le nom complet ne doit jamais
 * apparaître dans le code envoyé au navigateur (vérifié par `npm run check:dist`).
 */
function isSecretKey(value: string): boolean {
  return value.startsWith('sb_secret_') || (jwtRole(value) ?? '').startsWith('service')
}

function isSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname)
    return url.protocol === 'https:' || (url.protocol === 'http:' && isLocal)
  } catch {
    return false
  }
}

const required = (name: string) =>
  z
    .string({ error: `La variable ${name} est manquante.` })
    .trim()
    .min(1, { error: `La variable ${name} est vide.` })

const schema = z.object({
  VITE_SUPABASE_URL: required('VITE_SUPABASE_URL').refine(isSupabaseUrl, {
    error: 'VITE_SUPABASE_URL doit être une adresse https://… (celle de votre projet Supabase).',
  }),
  VITE_SUPABASE_ANON_KEY: required('VITE_SUPABASE_ANON_KEY')
    .min(20, { error: 'VITE_SUPABASE_ANON_KEY semble incomplète.' })
    .refine((value) => !isSecretKey(value), {
      error:
        'VITE_SUPABASE_ANON_KEY contient une clé SECRÈTE. Utilisez uniquement la clé publique (anon / publishable) dans le navigateur.',
    }),
  VITE_AUTH_EMAIL_DOMAIN: required('VITE_AUTH_EMAIL_DOMAIN')
    .transform((value) => value.toLowerCase())
    .refine((value) => /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(value), {
      error: 'VITE_AUTH_EMAIL_DOMAIN doit être un nom de domaine, par exemple shops.jago.app.',
    }),
})

export interface Env {
  supabaseUrl: string
  supabaseAnonKey: string
  authEmailDomain: string
}

export type EnvResult = { ok: true; env: Env } | { ok: false; errors: string[] }

/** Validation pure (testable) des variables d’environnement du navigateur. */
export function parseEnv(raw: Record<string, unknown>): EnvResult {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) }
  }
  return {
    ok: true,
    env: {
      supabaseUrl: parsed.data.VITE_SUPABASE_URL.replace(/\/+$/, ''),
      supabaseAnonKey: parsed.data.VITE_SUPABASE_ANON_KEY,
      authEmailDomain: parsed.data.VITE_AUTH_EMAIL_DOMAIN,
    },
  }
}

export function loadEnv(): EnvResult {
  return parseEnv(import.meta.env)
}
