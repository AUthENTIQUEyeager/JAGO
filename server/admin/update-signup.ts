import { z } from 'zod'
import { audit } from '../_lib/audit.js'
import { ApiError, defineHandler } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin',
  rateLimit: { name: 'update-signup', limit: 200, windowSec: 3600 },
  schema: z
    .object({
      id: z.string().uuid(),
      status: z.enum(['new', 'contacted', 'created', 'rejected']).optional(),
      admin_notes: z.string().trim().max(1000).optional(),
    })
    .strict(),
  run: async ({ admin, userId }, input) => {
    const patch: Record<string, unknown> = {}
    if (input.status !== undefined) {
      patch.status = input.status
      patch.handled_at = input.status === 'new' ? null : new Date().toISOString()
    }
    if (input.admin_notes !== undefined) patch.admin_notes = input.admin_notes || null
    if (Object.keys(patch).length === 0)
      throw new ApiError(400, 'invalid_input', 'Rien à modifier.')
    const res = await admin.from('signup_requests').update(patch).eq('id', input.id).select('id')
    if (res.error) throw new Error(res.error.message)
    if (!Array.isArray(res.data) || res.data.length === 0)
      throw new ApiError(404, 'not_found', 'Demande introuvable.')
    await audit(admin, {
      userId,
      shopId: null,
      action: 'update_signup',
      details: { signup_id: input.id, status: input.status ?? null },
    })
    return { ok: true }
  },
})
