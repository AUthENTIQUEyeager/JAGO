import { z } from 'zod'
import { defineHandler, mapDbError } from '../_lib/http.js'

export default defineHandler({
  auth: 'owner',
  schema: z.object({}).strict(),
  run: async ({ admin, shopId }) => {
    const { data, error } = await admin
      .from('profiles')
      .select('user_id,full_name,role,phone,is_active,last_seen_at')
      .eq('shop_id', shopId ?? '')
    if (error) mapDbError(error)
    return { staff: (data ?? []) as unknown[] }
  },
})
