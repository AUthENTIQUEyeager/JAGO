import { z } from 'zod'
import { newTemporaryPassword } from '../_lib/accounts.js'
import { audit } from '../_lib/audit.js'
import { ApiError, defineHandler } from '../_lib/http.js'

export default defineHandler({
  auth: 'owner',
  rateLimit: { name: 'reset-staff-password', limit: 10, windowSec: 3600 },
  schema: z.object({ user_id: z.string().uuid() }).strict(),
  run: async ({ admin, userId, shopId }, { user_id }) => {
    const target = await admin
      .from('profiles')
      .select('user_id,role,phone')
      .eq('user_id', user_id)
      .eq('shop_id', shopId ?? '')
      .maybeSingle()
    const row = target.data as { role: string; phone: string | null } | null
    if (!row || row.role === 'owner')
      throw new ApiError(404, 'not_found', 'Personne introuvable dans votre boutique.')
    const password = newTemporaryPassword()
    const upd = await admin.auth.admin.updateUserById(user_id, { password })
    if (upd.error) throw new Error(upd.error.message)
    await admin.from('profiles').update({ must_change_password: true }).eq('user_id', user_id)
    await audit(admin, {
      userId,
      shopId,
      action: 'staff_reset_password',
      details: { target: user_id },
    })
    return { identifier: row.phone ?? upd.data.user.email ?? '', password }
  },
})
