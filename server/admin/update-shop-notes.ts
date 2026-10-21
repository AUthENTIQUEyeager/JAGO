import { z } from 'zod'
import { audit } from '../_lib/audit.js'
import { ApiError, defineHandler, mapDbError } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin',
  schema: z.object({ shop_id: z.string().uuid(), notes: z.string().trim().max(2000) }).strict(),
  run: async ({ admin, userId }, { shop_id, notes }) => {
    const { data, error } = await admin
      .from('shops')
      .update({ notes_admin: notes })
      .eq('id', shop_id)
      .select('id')
    if (error) mapDbError(error)
    if (!data || data.length === 0) throw new ApiError(404, 'not_found', 'Boutique introuvable.')
    await audit(admin, { userId, shopId: shop_id, action: 'update_shop_notes' })
    return { ok: true as const }
  },
})
