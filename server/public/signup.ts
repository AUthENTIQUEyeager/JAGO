import { z } from 'zod'
import { ApiError, defineHandler } from '../_lib/http.js'

/** Retire les caractères de contrôle (sauf retour à la ligne) et les espaces superflus. */
const clean = (v: string) =>
  [...v]
    .map((c) => {
      const code = c.charCodeAt(0)
      return (code < 32 && code !== 10) || code === 127 ? ' ' : c
    })
    .join('')
    .trim()
const text = (min: number, max: number) =>
  z.string().transform(clean).pipe(z.string().min(min).max(max))
const optionalText = (max: number) =>
  z
    .string()
    .transform(clean)
    .pipe(z.string().max(max))
    .optional()
    .transform((v) => v || null)

export const ACTIVITIES = ['shop', 'units', 'print', 'other'] as const
export const SIGNUP_LIMITS = { perIpPerHour: 5, globalPerDay: 300 } as const

/**
 * Demande d'inscription envoyée depuis la page d'accueil (route PUBLIQUE).
 * Défenses : limite par IP, plafond global quotidien, champ piège anti-robot, validation stricte, aucune
 * information renvoyée sur l'existence d'une demande précédente (réponse identique dans tous les cas acceptés).
 */
export default defineHandler({
  auth: 'public',
  rateLimit: { name: 'signup', limit: SIGNUP_LIMITS.perIpPerHour, windowSec: 3600 },
  schema: z
    .object({
      full_name: text(2, 120),
      shop_name: text(2, 160),
      phone: z
        .string()
        .transform((v) => v.replace(/[\s.\-()]/g, ''))
        .pipe(z.string().regex(/^\+?\d{8,18}$/, 'Numéro invalide')),
      email: z
        .string()
        .transform(clean)
        .pipe(z.union([z.literal(''), z.string().email().max(200)]))
        .optional()
        .transform((v) => v || null),
      country: optionalText(60),
      city: optionalText(100),
      activity: z.enum(ACTIVITIES),
      message: optionalText(1000),
      consent: z.literal(true),
      /** Champ piège : invisible pour une personne, rempli par les robots. */
      website: z.string().max(200).optional(),
    })
    .strict(),
  run: async ({ admin }, input) => {
    const received = { received: true }
    if (input.website) return received // robot : on fait semblant que c'est accepté, sans rien enregistrer

    const global = await admin.rpc('rate_limit_hit', {
      p_key: 'signup:global',
      p_limit: SIGNUP_LIMITS.globalPerDay,
      p_window_seconds: 86_400,
    })
    if (global.error) throw new Error('rate_limit_failed')
    if (global.data === false)
      throw new ApiError(
        429,
        'rate_limited',
        'Trop de demandes pour le moment. Réessayez plus tard.',
      )

    // Même numéro déjà en attente : on ne crée pas de doublon (et on ne le révèle pas).
    const pending = await admin
      .from('signup_requests')
      .select('id')
      .eq('phone', input.phone)
      .eq('status', 'new')
      .limit(1)
    if (pending.error) throw new Error(pending.error.message)
    if (Array.isArray(pending.data) && pending.data.length > 0) return received

    const { error } = await admin.from('signup_requests').insert({
      full_name: input.full_name,
      shop_name: input.shop_name,
      phone: input.phone,
      email: input.email,
      country: input.country,
      city: input.city,
      activity: input.activity,
      message: input.message,
    })
    if (error) throw new Error(error.message)
    return received
  },
})
