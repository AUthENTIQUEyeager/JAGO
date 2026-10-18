// @vitest-environment node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const headerSchema = z.object({ key: z.string(), value: z.string() })
const configSchema = z.object({
  rewrites: z.array(z.object({ source: z.string(), destination: z.string() })),
  headers: z.array(z.object({ source: z.string(), headers: z.array(headerSchema) })),
})

const raw: unknown = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8'),
)
const config = configSchema.parse(raw)

function header(source: string, key: string): string | undefined {
  return config.headers
    .find((rule) => rule.source === source)
    ?.headers.find((entry) => entry.key.toLowerCase() === key.toLowerCase())?.value
}

function cspDirectives(): Map<string, string[]> {
  const value = header('/(.*)', 'Content-Security-Policy') ?? ''
  const map = new Map<string, string[]>()
  for (const part of value.split(';')) {
    const [name, ...tokens] = part.trim().split(/\s+/)
    if (name) map.set(name, tokens)
  }
  return map
}

describe('vercel.json', () => {
  it('redirige les pages vers index.html sans toucher à /api', () => {
    const rule = config.rewrites[0]
    expect(rule?.destination).toBe('/index.html')
    const pattern = new RegExp(`^${rule?.source ?? ''}$`)
    expect(pattern.test('/produits')).toBe(true)
    expect(pattern.test('/api/admin/list-shops')).toBe(false)
  })

  it('a une CSP stricte : pas de script inline ni d’eval, pas de cadre, pas d’objet', () => {
    const csp = cspDirectives()
    expect(csp.get('default-src')).toEqual(["'self'"])
    expect(csp.get('script-src')).toEqual(["'self'"])
    expect(csp.get('object-src')).toEqual(["'none'"])
    expect(csp.get('frame-ancestors')).toEqual(["'none'"])
    expect(csp.get('base-uri')).toEqual(["'self'"])
    expect(csp.get('worker-src')).toEqual(["'self'"])
    const all = [...csp.values()].flat().join(' ')
    expect(all).not.toContain('unsafe-eval')
    expect(csp.get('script-src')?.join(' ')).not.toContain('unsafe-inline')
  })

  it('porte les en-têtes de sécurité de base', () => {
    expect(header('/(.*)', 'Strict-Transport-Security')).toContain('max-age=63072000')
    expect(header('/(.*)', 'X-Content-Type-Options')).toBe('nosniff')
    expect(header('/(.*)', 'X-Frame-Options')).toBe('DENY')
    expect(header('/(.*)', 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header('/(.*)', 'Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(header('/(.*)', 'Permissions-Policy')).toBe(
      'camera=(self), microphone=(), geolocation=(), payment=()',
    )
  })

  it('ne met jamais en cache le Service Worker ni la page d’entrée', () => {
    for (const source of ['/', '/index.html', '/sw.js', '/registerSW.js']) {
      expect(header(source, 'Cache-Control')).toBe('no-cache')
    }
    expect(header('/assets/(.*)', 'Cache-Control')).toContain('immutable')
  })
})
