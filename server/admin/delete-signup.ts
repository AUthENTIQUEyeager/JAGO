import { z } from 'zod'
import { audit } from '../_lib/audit.js'
import { ApiError, defineHandler } from '../_lib/http.js'

/** Suppression d'une demande (minimisation des données personnelles une fois la demande traitée). */
export default defineHandler({
  auth: 'admin_recent_mfa',
  rateLimit: { name: 'delete-signup', limit: 100, windowSec: 3600 },
  schema: z.object({ id: z.string().uuid() }).strict(),
  run: async ({ admin, userId }, input) => {
    const res = await admin.from('signup_requests').delete().eq('id', input.id).select('id')
    if (res.error) throw new Error(res.error.message)
    if (!Array.isArray(res.data) || res.data.length === 0)
      throw new ApiError(404, 'not_found', 'Demande introuvable.')
    await audit(admin, {
      userId,
      shopId: null,
      action: 'delete_signup',
      details: { signup_id: input.id },
    })
    return { ok: true }
  },
})
