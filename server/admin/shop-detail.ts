import { z } from 'zod'
import { ApiError, defineHandler, mapDbError } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin',
  schema: z.object({ shop_id: z.string().uuid() }).strict(),
  run: async ({ admin }, { shop_id }) => {
    const shop = await admin
      .from('shops')
      .select(
        'id,name,owner_phone,status,blocked_reason,blocked_at,block_message,notes_admin,created_at,last_seen_at,pending_count,app_version,device_clock_skew_seconds',
      )
      .eq('id', shop_id)
      .maybeSingle()
    if (shop.error) mapDbError(shop.error)
    if (!shop.data) throw new ApiError(404, 'not_found', 'Boutique introuvable.')
    const [stats, staff] = await Promise.all([
      admin.rpc('admin_shop_stats', { p_shop: shop_id }),
      admin
        .from('profiles')
        .select('user_id,full_name,role,phone,is_active,last_seen_at')
        .eq('shop_id', shop_id),
    ])
    if (stats.error) mapDbError(stats.error)
    return {
      shop: shop.data as unknown,
      stats: stats.data as unknown,
      staff: (staff.data ?? []) as unknown[],
    }
  },
})
