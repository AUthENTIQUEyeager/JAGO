import { z } from 'zod'
import {
  createAuthUser,
  identifierFor,
  newTemporaryPassword,
  rollbackUser,
} from '../_lib/accounts.js'
import { audit } from '../_lib/audit.js'
import { defineHandler } from '../_lib/http.js'
import { maskPhone } from '../../src/lib/phone.js'

export default defineHandler({
  auth: 'owner',
  rateLimit: { name: 'create-staff', limit: 20, windowSec: 3600 },
  // Le rôle « owner » n'est pas accepté : un propriétaire ne peut ni se dupliquer ni promouvoir quelqu'un.
  schema: z
    .object({
      full_name: z.string().trim().min(1).max(200),
      phone: z.string().trim().min(8).max(32),
      role: z.enum(['manager', 'cashier']),
    })
    .strict(),
  run: async ({ admin, userId, shopId }, input) => {
    const id = identifierFor(input.phone)
    const password = newTemporaryPassword()
    const newUserId = await createAuthUser(admin, id.email, password)
    const { error } = await admin.from('profiles').insert({
      user_id: newUserId,
      shop_id: shopId,
      role: input.role,
      full_name: input.full_name,
      phone: id.phone,
    })
    if (error) {
      await rollbackUser(admin, newUserId)
      throw new Error(error.message)
    }
    await audit(admin, {
      userId,
      shopId,
      action: 'create_staff',
      details: { role: input.role, phone: maskPhone(id.phone) },
    })
    return { identifier: id.phone, password }
  },
})
