import { z } from 'zod'
import { audit } from '../_lib/audit.js'
import { defineHandler, mapDbError } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin_recent_mfa',
  schema: z
    .object({
      support_phone: z.string().trim().max(32),
      support_whatsapp: z.string().trim().max(32),
      terms_version: z.string().trim().min(1).max(32),
      terms_text: z.string().max(20000),
      maintenance_message: z.string().trim().max(500).nullable(),
    })
    .strict(),
  run: async ({ admin, userId }, input) => {
    const { error } = await admin.from('platform_settings').update(input).eq('id', 1)
    if (error) mapDbError(error)
    await audit(admin, {
      userId,
      shopId: null,
      action: 'update_platform_settings',
      details: {
        terms_version: input.terms_version,
        maintenance: Boolean(input.maintenance_message),
      },
    })
    return { ok: true as const }
  },
})
