const COMMON = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '87654321',
  '11111111',
  '00000000',
  '99999999',
  'password',
  'password1',
  'motdepasse',
  'azertyui',
  'azerty123',
  'qwertyui',
  'qwerty123',
  'jago1234',
  'abcd1234',
])

export interface PasswordRules {
  minLength?: number
  /** Valeurs que le mot de passe ne doit pas contenir (téléphone, nom de boutique…). */
  forbidden?: readonly string[]
}

/** Renvoie un message d'erreur en français, ou null si le mot de passe est accepté. */
export function validatePassword(password: string, rules: PasswordRules = {}): string | null {
  const min = rules.minLength ?? 8
  if (password.length < min) return `Le mot de passe doit contenir au moins ${min} caractères.`
  if (password.length > 128) return 'Le mot de passe est trop long (128 caractères maximum).'
  const lower = password.toLowerCase()
  if (COMMON.has(lower) || /^(.)\1+$/.test(password))
    return 'Ce mot de passe est trop simple. Choisissez-en un autre.'
  for (const item of rules.forbidden ?? []) {
    const needle = item.toLowerCase().replace(/\s/g, '')
    if (needle.length >= 4 && lower.replace(/\s/g, '').includes(needle)) {
      return 'Le mot de passe ne doit pas contenir votre téléphone ou le nom de la boutique.'
    }
  }
  return null
}

/** 0 (très faible) à 4 (fort), pour l'indicateur visuel. */
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  if (validatePassword(password) !== null) return password.length === 0 ? 0 : 1
  let score = 1
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++
  return Math.min(4, score) as 1 | 2 | 3 | 4
}

const CHARS = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Mot de passe aléatoire sûr (sans caractères ambigus). Jamais dérivé d'une donnée connue. */
export function generatePassword(length = 14): string {
  const limit = 256 - (256 % CHARS.length)
  let out = ''
  while (out.length < length) {
    for (const byte of globalThis.crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += CHARS.charAt(byte % CHARS.length)
    }
  }
  return out
}
