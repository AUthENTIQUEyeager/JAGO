import { z } from 'zod'
import { audit } from '../_lib/audit.js'
import { ApiError, defineHandler, mapDbError } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin_recent_mfa',
  schema: z
    .object({
      shop_id: z.string().uuid(),
      status: z.enum(['active', 'blocked']),
      reason: z.string().trim().max(500).optional(),
      message: z.string().trim().max(500).optional(),
    })
    .strict(),
  run: async ({ admin, userId }, input) => {
    if (input.status === 'blocked' && !input.reason)
      throw new ApiError(400, 'invalid_input', 'Indiquez le motif interne du blocage.')
    const patch =
      input.status === 'blocked'
        ? {
            status: 'blocked',
            blocked_reason: input.reason ?? null,
            blocked_at: new Date().toISOString(),
            block_message: input.message ?? null,
          }
        : { status: 'active', blocked_reason: null, blocked_at: null, block_message: null }
    const { data, error } = await admin
      .from('shops')
      .update(patch)
      .eq('id', input.shop_id)
      .select('id')
    if (error) mapDbError(error)
    if (!data || data.length === 0) throw new ApiError(404, 'not_found', 'Boutique introuvable.')
    await audit(admin, {
      userId,
      shopId: input.shop_id,
      action: input.status === 'blocked' ? 'block_shop' : 'unblock_shop',
      reason: input.reason ?? null,
      details: { message: input.message ?? null },
    })
    return { status: input.status }
  },
})
