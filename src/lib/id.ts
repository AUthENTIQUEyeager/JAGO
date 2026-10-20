/** Identifiant unique, avec repli si crypto.randomUUID est indisponible (contexte non sécurisé). */
export function newId(): string {
  const c = globalThis.crypto
  if (typeof c.randomUUID === 'function') return c.randomUUID()
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** 4 caractères aléatoires, générés une fois par appareil (pour les numéros de reçu). */
export function newDeviceShort(): string {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(4))
  return Array.from(b, (x) => ALPHABET.charAt(x % ALPHABET.length)).join('')
}
