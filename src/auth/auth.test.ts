// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  createPinRecord,
  loginDelaySeconds,
  pinLockoutSeconds,
  validatePinFormat,
  verifyPin,
} from './pin'

describe('PIN', () => {
  it('dérive avec PBKDF2 (sel aléatoire) et ne stocke jamais le code en clair', async () => {
    const a = await createPinRecord('4821', 210_000)
    const b = await createPinRecord('4821', 210_000)
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
    expect(a.iterations).toBeGreaterThanOrEqual(200_000)
    expect(JSON.stringify(a)).not.toContain('4821')
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
  })
  it('vérifie le bon code et refuse les autres', async () => {
    const record = await createPinRecord('4821', 210_000)
    expect(await verifyPin('4821', record)).toBe(true)
    for (const bad of ['4822', '', '482', '48210'])
      expect(await verifyPin(bad, record), bad).toBe(false)
  })
  it('refuse les formats et codes triviaux', () => {
    for (const bad of ['123', '1234567', 'abcd', '0000', '1111', '1234', '123456', '9876'])
      expect(validatePinFormat(bad), bad).not.toBeNull()
    expect(validatePinFormat('4821')).toBeNull()
    expect(validatePinFormat('739051')).toBeNull()
  })
  it('impose des délais croissants après des échecs', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 9].map(pinLockoutSeconds)).toEqual([
      0, 0, 0, 30, 60, 300, 900, 900,
    ])
    expect([0, 2, 3, 4, 5, 10, 30].map(loginDelaySeconds)).toEqual([0, 0, 5, 10, 20, 120, 120])
  })
})
