import { z } from 'zod'

export const SIGNUP_STATUSES = ['new', 'contacted', 'created', 'rejected'] as const
export type SignupStatus = (typeof SIGNUP_STATUSES)[number]

export const STATUS_LABEL: Record<SignupStatus, string> = {
  new: 'Nouvelle',
  contacted: 'Contactée',
  created: 'Compte créé',
  rejected: 'Refusée',
}

export const ACTIVITY_LABEL: Record<string, string> = {
  shop: 'Boutique / commerce',
  units: 'Unités et transferts',
  print: 'Impression / rédaction',
  other: 'Autre',
}

const ns = z
  .string()
  .nullish()
  .transform((v) => v ?? null)

export const signupSchema = z.object({
  id: z.string(),
  full_name: z.string(),
  shop_name: z.string(),
  phone: z.string(),
  email: ns,
  country: ns,
  city: ns,
  activity: z.string(),
  message: ns,
  status: z.enum(SIGNUP_STATUSES),
  admin_notes: ns,
  shop_id: ns,
  created_at: z.string(),
  handled_at: ns,
})
export const signupListSchema = z.object({ requests: z.array(signupSchema) })
export type SignupRow = z.infer<typeof signupSchema>

/** Notes pré-remplies pour la fiche boutique créée depuis une demande. */
export function notesFromSignup(s: SignupRow): string {
  return [
    `Demande d'inscription du ${s.created_at.slice(0, 10)}`,
    `Activité : ${ACTIVITY_LABEL[s.activity] ?? s.activity}`,
    [s.city, s.country].filter(Boolean).join(', '),
    s.email ? `E-mail : ${s.email}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
