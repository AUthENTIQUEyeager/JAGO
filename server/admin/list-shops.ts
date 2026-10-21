import { z } from 'zod'
import { defineHandler, mapDbError } from '../_lib/http.js'

export default defineHandler({
  auth: 'admin',
  schema: z.object({}).strict(),
  run: async ({ admin }) => {
    const res = await admin.rpc('admin_overview')
    if (res.error) mapDbError(res.error)
    const shops: unknown = res.data
    return { shops: Array.isArray(shops) ? (shops as unknown[]) : [] }
  },
})
