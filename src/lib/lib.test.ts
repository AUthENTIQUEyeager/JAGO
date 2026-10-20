import { describe, expect, it } from 'vitest'
import { CSV_LIMITS, csvCell, neutralizeFormula, parseCsv, toCsv } from './csv'
import { addDays, dayKey, formatDateTime, periodRange } from './dates'
import { newDeviceShort, newId } from './id'
import { formatMoney, lineTotal, parseMoney, parseQty, percentOf, sumQty } from './money'
import { maskPhone, normalizePhone, phoneDigits, toAuthEmail } from './phone'
import { generatePassword, passwordStrength, validatePassword } from './password'
import { normalizeText } from './text'

describe('money', () => {
  it('formate en FCFA sans décimales', () => {
    expect(formatMoney(12500).replace(/\s/g, ' ')).toBe('12 500 FCFA')
    expect(formatMoney(0)).toBe('0 FCFA')
  })
  it('lit les montants saisis', () => {
    expect(parseMoney('12 500')).toBe(12500)
    expect(parseMoney('5000 FCFA')).toBe(5000)
    for (const bad of ['', 'abc', '-5', '12,5', '1e5']) expect(parseMoney(bad), bad).toBeNull()
  })
  it('lit les quantités (virgule ou point, 3 décimales)', () => {
    expect(parseQty('1,5')).toBe(1.5)
    expect(parseQty('0.250')).toBe(0.25)
    for (const bad of ['0', '-1', '1.2345', 'x']) expect(parseQty(bad), bad).toBeNull()
  })
  it('calcule une ligne sans erreur de virgule flottante', () => {
    expect(lineTotal(1.5, 1000)).toBe(1500)
    expect(lineTotal(0.1 * 3, 1000)).toBe(300)
    expect(lineTotal(2.333, 1500)).toBe(3500)
    expect(lineTotal(3, 1000, 5000)).toBe(0)
  })
  it('remises en pourcentage arrondies', () => {
    expect(percentOf(1999, 10)).toBe(200)
    expect(sumQty([0.1, 0.2])).toBe(0.3)
  })
})

describe('phone', () => {
  it('normalise les numéros burkinabè', () => {
    for (const ok of ['70123456', '+226 70 12 34 56', '0022670123456', '226-70-12-34-56']) {
      expect(normalizePhone(ok), ok).toBe('+22670123456')
    }
    for (const bad of ['1234567', '+33612345678', 'abc', ''])
      expect(normalizePhone(bad), bad).toBeNull()
    expect(phoneDigits('70 12 34 56')).toBe('22670123456')
  })
  it('construit l’email technique', () => {
    expect(toAuthEmail('70 12 34 56', 'Shops.Jago.App')).toBe('22670123456@shops.jago.app')
    expect(toAuthEmail('Admin@Exemple.com', 'x.app')).toBe('admin@exemple.com')
    expect(toAuthEmail('abc', 'x.app')).toBeNull()
    expect(toAuthEmail('pas un@email', 'x.app')).toBeNull()
  })
  it('masque les numéros dans les journaux', () => {
    expect(maskPhone('+22670123456')).toBe('+226 70 ** ** 56')
    expect(maskPhone(null)).toBe('***')
  })
})

describe('password', () => {
  it('refuse les mots de passe faibles ou liés à la boutique', () => {
    expect(validatePassword('1234567')).toContain('au moins 8')
    expect(validatePassword('12345678')).toContain('trop simple')
    expect(validatePassword('aaaaaaaa')).toContain('trop simple')
    expect(validatePassword('Boutique Sali22', { forbidden: ['Boutique Sali'] })).toContain(
      'ne doit pas contenir',
    )
    expect(validatePassword('70123456xy', { forbidden: ['70123456'] })).not.toBeNull()
    expect(validatePassword('Kp7-vera-nouv', { minLength: 14 })).toContain('14')
    expect(validatePassword('Mot2passe-sûr')).toBeNull()
  })
  it('génère des mots de passe aléatoires et uniques', () => {
    const set = new Set(Array.from({ length: 50 }, () => generatePassword()))
    expect(set.size).toBe(50)
    for (const p of set) {
      expect(p).toHaveLength(14)
      expect(p).toMatch(/^[A-Za-z0-9]+$/)
    }
    expect(passwordStrength(generatePassword(16))).toBeGreaterThanOrEqual(3)
    expect(passwordStrength('')).toBe(0)
  })
})

describe('csv', () => {
  it('neutralise l’injection de formules', () => {
    for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tx', '\rx']) {
      expect(neutralizeFormula(evil).startsWith("'"), evil).toBe(true)
    }
    expect(neutralizeFormula('Riz')).toBe('Riz')
    expect(csvCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"')
    expect(csvCell(-5)).toBe('-5')
  })
  it('exporte pour Excel (; + BOM) et relit', () => {
    const out = toCsv(
      ['Nom', 'Prix'],
      [
        ['Riz; "extra"', 1000],
        ['=bad', null],
      ],
    )
    expect(out.startsWith('\uFEFF')).toBe(true)
    const rows = parseCsv(out)
    expect(rows[0]).toEqual(['Nom', 'Prix'])
    expect(rows[1]).toEqual(['Riz; "extra"', '1000'])
    expect(rows[2]).toEqual(["'=bad", ''])
    expect(CSV_LIMITS.maxRows).toBe(10_000)
  })
  it('détecte la virgule et ignore les lignes vides', () => {
    expect(parseCsv('a,b\r\n\r\n1,"2,5"\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2,5'],
    ])
  })
})

describe('dates, texte, identifiants', () => {
  it('affiche dd/MM/yyyy HH:mm en UTC+0', () => {
    expect(formatDateTime('2026-10-18T14:05:00Z')).toBe('18/10/2026 14:05')
    expect(dayKey('2026-10-18T23:59:00Z')).toBe('2026-10-18')
  })
  it('calcule les périodes', () => {
    const now = new Date('2026-10-18T14:05:00Z')
    expect(periodRange('today', now)).toEqual({
      from: '2026-10-18T00:00:00.000Z',
      to: '2026-10-19T00:00:00.000Z',
    })
    expect(periodRange('7d', now).from).toBe('2026-10-12T00:00:00.000Z')
    expect(periodRange('month', now).from).toBe('2026-10-01T00:00:00.000Z')
    expect(periodRange('custom', now, { from: '2026-10-01', to: '2026-10-03' }).to).toBe(
      '2026-10-04T00:00:00.000Z',
    )
    expect(addDays(new Date('2026-10-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-11-01T00:00:00.000Z',
    )
  })
  it('recherche sans accents ni casse', () => {
    expect(normalizeText('  Crème ÉPICÉE ')).toBe('creme epicee')
  })
  it('génère des identifiants valides', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newDeviceShort()).toMatch(/^[a-z2-9]{4}$/)
  })
})
