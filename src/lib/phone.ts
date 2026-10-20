/** Numéro burkinabè : +226 suivi de 8 chiffres. Renvoie « +226XXXXXXXX » ou null. */
export function normalizePhone(input: string): string | null {
  const digits = input
    .replace(/[\s.\-()]/g, '')
    .replace(/^\+/, '')
    .replace(/^00/, '')
  if (!/^\d+$/.test(digits)) return null
  if (digits.length === 8) return `+226${digits}`
  if (digits.length === 11 && digits.startsWith('226')) return `+${digits}`
  return null
}

/** Chiffres seuls au format international (ex. 22670123456), pour wa.me et l'email technique. */
export function phoneDigits(input: string): string | null {
  const normalized = normalizePhone(input)
  return normalized ? normalized.slice(1) : null
}

/** Email technique d'un compte : « 22670123456@domaine ». Un vrai email (avec @) est conservé. */
export function toAuthEmail(identifier: string, domain: string): string | null {
  const value = identifier.trim().toLowerCase()
  if (value.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null
  const digits = phoneDigits(value)
  return digits ? `${digits}@${domain.toLowerCase()}` : null
}

/** « +226 70 ** ** 56 » pour les journaux. */
export function maskPhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length < 8) return '***'
  const local = digits.slice(-8)
  return `+226 ${local.slice(0, 2)} ** ** ${local.slice(6)}`
}
