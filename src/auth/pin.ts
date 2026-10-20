/** Verrou PIN : dérivé PBKDF2 (WebCrypto, sel aléatoire). C'est un verrou d'interface, pas un chiffrement des données. */
export const PIN_ITERATIONS = 210_000
export const MAX_PIN_FAILURES = 10

export interface PinRecord {
  salt: string
  hash: string
  iterations: number
}

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('')
const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes))
const fromB64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

async function derive(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  return toHex(
    await globalThis.crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      key,
      256,
    ),
  )
}

export async function createPinRecord(
  pin: string,
  iterations = PIN_ITERATIONS,
): Promise<PinRecord> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  return { salt: toB64(salt), hash: await derive(pin, salt, iterations), iterations }
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const actual = await derive(pin, fromB64(record.salt), record.iterations)
  let diff = actual.length ^ record.hash.length
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ (record.hash.charCodeAt(i) || 0)
  return diff === 0
}

/** 4 à 6 chiffres, pas de suite triviale. Renvoie un message d'erreur ou null. */
export function validatePinFormat(pin: string): string | null {
  if (!/^\d{4,6}$/.test(pin)) return 'Le code doit contenir 4 à 6 chiffres.'
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin))
    return 'Ce code est trop facile à deviner.'
  return null
}

/** Attente imposée après des échecs de PIN. */
export function pinLockoutSeconds(failures: number): number {
  if (failures < 3) return 0
  if (failures === 3) return 30
  if (failures === 4) return 60
  if (failures === 5) return 300
  return 900
}

/** Délai progressif de l'écran de connexion après des mots de passe faux. */
export function loginDelaySeconds(failures: number): number {
  return failures < 3 ? 0 : Math.min(5 * 2 ** (failures - 3), 120)
}
