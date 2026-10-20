import { z } from 'zod'
import { defineHandler, mapDbError } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin',
  schema: z
    .object({
      shop_id: z.string().uuid().optional(),
      action: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(200).default(100),
    })
    .strict(),
  run: async ({ admin }, input) => {
    let query = admin
      .from('audit_log')
      .select('seq,admin_user_id,shop_id,action,details,reason,created_at')
    if (input.shop_id) query = query.eq('shop_id', input.shop_id)
    if (input.action) query = query.eq('action', input.action)
    const { data, error } = await query.order('seq', { ascending: false }).limit(input.limit)
    if (error) mapDbError(error)
    return { entries: (data ?? []) as unknown[] }
  },
})
