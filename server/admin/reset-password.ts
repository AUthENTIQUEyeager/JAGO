import { z } from 'zod'
import { newTemporaryPassword } from '../_lib/accounts.js'
import { audit } from '../_lib/audit.js'
import { ApiError, defineHandler } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin_recent_mfa',
  rateLimit: { name: 'admin-reset-password', limit: 10, windowSec: 3600 },
  schema: z.object({ shop_id: z.string().uuid() }).strict(),
  run: async ({ admin, userId }, { shop_id }) => {
    const owner = await admin
      .from('profiles')
      .select('user_id')
      .eq('shop_id', shop_id)
      .eq('role', 'owner')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
    const parsed = z.object({ user_id: z.string() }).safeParse(owner.data)
    if (!parsed.success) throw new ApiError(404, 'not_found', 'Propriétaire introuvable.')
    const target = parsed.data.user_id
    const password = newTemporaryPassword()
    const upd = await admin.auth.admin.updateUserById(target, { password })
    if (upd.error) throw new Error(upd.error.message)
    await admin.from('profiles').update({ must_change_password: true }).eq('user_id', target)
    await audit(admin, { userId, shopId: shop_id, action: 'reset_owner_password' })
    return { identifier: upd.data.user.email ?? '', password }
  },
})
