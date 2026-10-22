import { z } from 'zod'
import { defineHandler } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin',
  schema: z.object({}).strict(),
  run: async ({ admin }) => {
    const res = await admin
      .from('signup_requests')
      .select(
        'id, full_name, shop_name, phone, email, country, city, activity, message, status, admin_notes, shop_id, created_at, handled_at',
      )
      .order('created_at', { ascending: false })
      .limit(300)
    if (res.error) throw new Error(res.error.message)
    return { requests: Array.isArray(res.data) ? (res.data as unknown[]) : [] }
  },
})
