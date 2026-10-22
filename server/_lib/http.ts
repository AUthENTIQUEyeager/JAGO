import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { maskPhone } from '../../src/lib/phone.js'
import { getAdmin } from './supabaseAdmin.js'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export type AuthMode = 'public' | 'user' | 'admin_aal1' | 'admin' | 'admin_recent_mfa' | 'owner'
const MAX_BODY_BYTES = 20_000
const RECENT_MFA_SECONDS = 300

export interface ApiContext {
  admin: SupabaseClient
  userId: string
  email: string | null
  /** Boutique de l'appelant (routes /api/shop/* uniquement), toujours déduite de son profil. */
  shopId: string | null
  requestId: string
  ip: string
}

interface Options<S extends z.ZodType> {
  auth: AuthMode
  schema: S
  rateLimit?: { name: string; limit: number; windowSec: number }
  run: (ctx: ApiContext, body: z.infer<S>) => Promise<unknown>
}

const profileRow = z.object({ shop_id: z.string(), role: z.string(), is_active: z.boolean() })

interface Claims {
  aal?: string
  amr?: Array<{ method?: string; timestamp?: number }>
}

/** Lit les revendications du jeton APRÈS que Supabase l'a validé (getUser). */
export function readClaims(token: string): Claims {
  try {
    const payload = token.split('.')[1] ?? ''
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const parsed = z
      .object({
        aal: z.string().optional(),
        amr: z
          .array(z.object({ method: z.string().optional(), timestamp: z.number().optional() }))
          .optional(),
      })
      .safeParse(JSON.parse(json))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

const send = (res: VercelResponse, status: number, body: unknown) => {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(body)
}

function clientIp(req: VercelRequest): string {
  // Vercel place l'adresse du client en tête de x-forwarded-for.
  const header = req.headers['x-forwarded-for']
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim()
  return first || String(req.headers['x-real-ip'] ?? 'inconnue')
}

/**
 * Enveloppe commune : refus par défaut (méthode, jeton, rôle, MFA), limitation de débit, validation stricte,
 * réponses homogènes { ok, data } / { ok:false, error }, aucune fuite de détails internes.
 */
export function defineHandler<S extends z.ZodType>(options: Options<S>) {
  // Une route publique SANS limite de débit serait ouverte à l'abus : on refuse de la définir.
  if (options.auth === 'public' && !options.rateLimit)
    throw new Error('Une route publique doit définir rateLimit.')
  return async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
    const requestId = Math.random().toString(36).slice(2, 10)
    try {
      if (req.method !== 'POST')
        throw new ApiError(405, 'method_not_allowed', 'Méthode non autorisée.')
      if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES)
        throw new ApiError(413, 'too_large', 'Requête trop volumineuse.')
      const admin = getAdmin()
      // Route publique (page d'accueil) : aucun jeton ni compte ; le débit est limité par adresse IP (plus bas).
      let user: { id: string; email?: string | undefined } | null = null
      let claims: Claims = {}
      if (options.auth !== 'public') {
        const auth = String(req.headers.authorization ?? '')
        const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
        if (!token) throw new ApiError(401, 'unauthenticated', 'Connexion requise.')
        const { data, error } = await admin.auth.getUser(token)
        if (error || !data.user)
          throw new ApiError(401, 'unauthenticated', 'Session invalide. Reconnectez-vous.')
        user = data.user
        claims = readClaims(token)
      }
      const ctx: ApiContext = {
        admin,
        userId: user?.id ?? '',
        email: user?.email ?? null,
        shopId: null,
        requestId,
        ip: clientIp(req),
      }

      if (options.auth.startsWith('admin') && user) {
        const row = await admin
          .from('platform_admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (!row.data) throw new ApiError(403, 'forbidden', 'Accès refusé.')
        if (options.auth !== 'admin_aal1' && claims.aal !== 'aal2')
          throw new ApiError(403, 'mfa_required', 'Vérification en deux étapes requise.')
        if (options.auth === 'admin_recent_mfa') {
          const stamp =
            claims.amr
              ?.filter((m) => m.method === 'totp')
              .reduce((max, m) => Math.max(max, m.timestamp ?? 0), 0) ?? 0
          if (Date.now() / 1000 - stamp > RECENT_MFA_SECONDS)
            throw new ApiError(403, 'reauth_required', 'Confirmez avec votre code à 6 chiffres.')
        }
      } else if (options.auth === 'owner' && user) {
        const profile = await admin
          .from('profiles')
          .select('shop_id, role, is_active')
          .eq('user_id', user.id)
          .maybeSingle()
        const p = profileRow.safeParse(profile.data)
        if (!p.success || !p.data.is_active || p.data.role !== 'owner')
          throw new ApiError(403, 'forbidden', 'Accès refusé.')
        const shop = await admin
          .from('shops')
          .select('status')
          .eq('id', p.data.shop_id)
          .maybeSingle()
        const shopRow = z.object({ status: z.string() }).safeParse(shop.data)
        if (!shopRow.success || shopRow.data.status !== 'active')
          throw new ApiError(403, 'shop_blocked', 'Boutique suspendue.')
        ctx.shopId = p.data.shop_id // JAMAIS lu dans le corps de la requête (anti-IDOR)
      }

      if (options.rateLimit) {
        const key = `${options.rateLimit.name}:${user?.id ?? 'public'}:${ctx.ip}`
        const hit = await admin.rpc('rate_limit_hit', {
          p_key: key,
          p_limit: options.rateLimit.limit,
          p_window_seconds: options.rateLimit.windowSec,
        })
        if (hit.error) throw new Error('rate_limit_failed')
        if (hit.data === false)
          throw new ApiError(429, 'rate_limited', 'Trop de demandes. Réessayez plus tard.')
      }

      const parsed = options.schema.safeParse(
        typeof req.body === 'string' ? safeJson(req.body) : (req.body ?? {}),
      )
      if (!parsed.success) {
        const fields = [
          ...new Set(parsed.error.issues.map((i) => i.path.join('.') || 'corps')),
        ].join(', ')
        throw new ApiError(400, 'invalid_input', `Données invalides (${fields}).`)
      }
      send(res, 200, { ok: true, data: await options.run(ctx, parsed.data) })
    } catch (error) {
      if (error instanceof ApiError)
        return send(res, error.status, {
          ok: false,
          error: { code: error.code, message: error.message },
        })
      // Détail interne uniquement dans les journaux serveur (sans secret ni téléphone complet).
      console.error(
        JSON.stringify({
          requestId,
          level: 'error',
          message:
            error instanceof Error
              ? error.message.replace(/\+?\d{8,}/g, (m) => maskPhone(m))
              : 'erreur',
        }),
      )
      send(res, 500, {
        ok: false,
        error: { code: 'internal', message: `Erreur du serveur (réf. ${requestId}).` },
      })
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Convertit une erreur Postgres connue en réponse claire. */
export function mapDbError(error: { code?: string; message?: string } | null): never {
  if (error?.code === '23514' && /dernier propriétaire/i.test(error.message ?? ''))
    throw new ApiError(
      409,
      'last_owner',
      'Impossible : c’est le dernier propriétaire de la boutique.',
    )
  throw new Error(error?.message ?? 'database_error')
}
