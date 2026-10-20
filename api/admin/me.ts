import { z } from 'zod'
import { defineHandler } from '../_lib/http.js'

/** Indique au navigateur si l'utilisateur est super admin (vérifié côté serveur). Ne demande pas encore la MFA. */
export default defineHandler({
  auth: 'admin_aal1',
  schema: z.object({}).strict(),
  run: () => Promise.resolve({ admin: true }),
})
