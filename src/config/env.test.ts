import { describe, expect, it } from 'vitest'
import { parseEnv } from './env'

function fakeJwt(role: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role })}.signature-de-test`
}

const valid = {
  VITE_SUPABASE_URL: 'https://abcdefgh.supabase.co/',
  VITE_SUPABASE_ANON_KEY: fakeJwt('anon'),
  VITE_AUTH_EMAIL_DOMAIN: 'Shops.Jago.App',
}

describe('parseEnv', () => {
  it('accepte une configuration valide et la normalise', () => {
    const result = parseEnv(valid)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.env.supabaseUrl).toBe('https://abcdefgh.supabase.co')
      expect(result.env.authEmailDomain).toBe('shops.jago.app')
    }
  })

  it('accepte une clé publique au nouveau format', () => {
    const result = parseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: 'sb_publishable_abcdefghijklmnop' })
    expect(result.ok).toBe(true)
  })

  it('signale en français chaque variable manquante', () => {
    const result = parseEnv({})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toHaveLength(3)
      expect(result.errors.join(' ')).toContain('VITE_SUPABASE_URL est manquante')
    }
  })

  it('refuse une adresse non sécurisée ou invalide', () => {
    expect(parseEnv({ ...valid, VITE_SUPABASE_URL: 'http://exemple.com' }).ok).toBe(false)
    expect(parseEnv({ ...valid, VITE_SUPABASE_URL: 'pas une adresse' }).ok).toBe(false)
    expect(parseEnv({ ...valid, VITE_SUPABASE_URL: 'http://localhost:54321' }).ok).toBe(true)
  })

  it('refuse une clé secrète (service_role) dans le navigateur', () => {
    const result = parseEnv({ ...valid, VITE_SUPABASE_ANON_KEY: fakeJwt('service_role') })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(' ')).toContain('clé SECRÈTE')
  })

  it('refuse une clé secrète au nouveau format', () => {
    const result = parseEnv({
      ...valid,
      VITE_SUPABASE_ANON_KEY: ['sb', 'secret', 'abcdefghijklmnopqrst'].join('_'),
    })
    expect(result.ok).toBe(false)
  })

  it('refuse un domaine d’email invalide', () => {
    expect(parseEnv({ ...valid, VITE_AUTH_EMAIL_DOMAIN: 'pas-un-domaine' }).ok).toBe(false)
    expect(parseEnv({ ...valid, VITE_AUTH_EMAIL_DOMAIN: 'a@b.com' }).ok).toBe(false)
  })
})
