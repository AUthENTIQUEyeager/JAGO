import { z } from 'zod'
import { audit } from '../_lib/audit.js'
import { defineHandler, mapDbError } from '../_lib/http.js'

/** Consultation DÉTAILLÉE : motif obligatoire, enregistrée dans le journal AVANT de renvoyer les données. */
export default defineHandler({
  auth: 'admin_recent_mfa',
  schema: z
    .object({
      shop_id: z.string().uuid(),
      reason: z.string().trim().min(5, 'Motif trop court').max(500),
    })
    .strict(),
  run: async ({ admin, userId }, { shop_id, reason }) => {
    await audit(admin, { userId, shopId: shop_id, action: 'view_shop_data', reason })
    const res = await admin.rpc('admin_shop_sales', { p_shop: shop_id, p_limit: 50 })
    if (res.error) mapDbError(res.error)
    const sales: unknown = res.data
    return { sales: Array.isArray(sales) ? (sales as unknown[]) : [] }
  },
})
