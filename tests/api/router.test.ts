// @vitest-environment node
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { describe, expect, it, vi } from 'vitest'
import { defineRouter } from '../../server/_lib/router'

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

describe('defineRouter', () => {
  it('appelle le handler correspondant à l’action', async () => {
    const hit = vi.fn()
    const router = defineRouter({ me: hit })
    await router(
      { query: { action: 'me' } } as unknown as VercelRequest,
      fakeRes() as unknown as VercelResponse,
    )
    expect(hit).toHaveBeenCalledOnce()
  })

  it('renvoie 404 pour une action inconnue ou absente', async () => {
    const router = defineRouter({ me: vi.fn() })
    for (const query of [{ action: 'nope' }, {}]) {
      const res = fakeRes()
      await router({ query } as unknown as VercelRequest, res as unknown as VercelResponse)
      expect(res.statusCode).toBe(404)
      expect(res.body).toMatchObject({ ok: false, error: { code: 'not_found' } })
    }
  })
})
