import { z } from 'zod'
import { audit } from '../_lib/audit.js'
import { ApiError, defineHandler, mapDbError } from '../_lib/http.js'

export default defineHandler({
  auth: 'owner',
  schema: z.object({ user_id: z.string().uuid(), active: z.boolean() }).strict(),
  run: async ({ admin, userId, shopId }, { user_id, active }) => {
    // La cible doit appartenir à la boutique de l'appelant : sinon « introuvable » (pas de fuite entre boutiques).
    const { data, error } = await admin
      .from('profiles')
      .update({ is_active: active })
      .eq('user_id', user_id)
      .eq('shop_id', shopId ?? '')
      .select('user_id')
    if (error) mapDbError(error)
    if (!data || data.length === 0)
      throw new ApiError(404, 'not_found', 'Personne introuvable dans votre boutique.')
    await audit(admin, {
      userId,
      shopId,
      action: active ? 'staff_reactivate' : 'staff_deactivate',
      details: { target: user_id },
    })
    return { ok: true as const }
  },
})
