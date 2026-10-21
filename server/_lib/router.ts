import type { VercelRequest, VercelResponse } from '@vercel/node'

export type RouteHandler = (req: VercelRequest, res: VercelResponse) => Promise<void> | void

/**
 * Regroupe plusieurs handlers derrière UNE seule fonction Vercel (limite de 12 fonctions du plan Hobby).
 * L'action est lue dans le segment d'URL dynamique : /api/admin/<action>.
 */
export function defineRouter(routes: Record<string, RouteHandler>) {
  const table = new Map(Object.entries(routes))
  return async function router(req: VercelRequest, res: VercelResponse): Promise<void> {
    const raw = req.query.action
    const action = Array.isArray(raw) ? raw[0] : raw
    const handler = action ? table.get(action) : undefined
    if (!handler) {
      res.setHeader('Cache-Control', 'no-store')
      res.status(404).json({
        ok: false,
        error: { code: 'not_found', message: 'Route inconnue.' },
      })
      return
    }
    await handler(req, res)
  }
}
