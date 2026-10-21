import type { SupabaseClient } from '@supabase/supabase-js'
import { generatePassword, validatePassword } from '../../src/lib/password.js'
import { normalizePhone, toAuthEmail } from '../../src/lib/phone.js'
import { ApiError } from './http.js'
import { authEmailDomain } from './supabaseAdmin.js'

export function identifierFor(
  phone: string,
  emailOverride?: string,
): { email: string; phone: string } {
  const normalized = normalizePhone(phone)
  if (!normalized)
    throw new ApiError(
      400,
      'invalid_phone',
      'Numéro de téléphone invalide (8 chiffres du Burkina Faso).',
    )
  const email = toAuthEmail(emailOverride ?? normalized, authEmailDomain())
  if (!email) throw new ApiError(400, 'invalid_email', 'Identifiant invalide.')
  return { email, phone: normalized }
}

export function checkPassword(password: string, forbidden: string[]): void {
  const problem = validatePassword(password, { minLength: 8, forbidden })
  if (problem) throw new ApiError(400, 'weak_password', problem)
}

export const newTemporaryPassword = (): string => generatePassword(14)

/** Crée le compte Auth. Un identifiant déjà pris donne une erreur claire (sans révéler d'autre information). */
export async function createAuthUser(
  admin: SupabaseClient,
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) {
    if (error && /already|exists|registered/i.test(error.message))
      throw new ApiError(409, 'account_exists', 'Un compte existe déjà avec cet identifiant.')
    throw new Error(error?.message ?? 'create_user_failed')
  }
  return data.user.id
}

/** Annule un compte Auth créé quand l'étape suivante échoue (pas de compte orphelin). */
export async function rollbackUser(admin: SupabaseClient, userId: string): Promise<void> {
  await admin.auth.admin.deleteUser(userId)
}
