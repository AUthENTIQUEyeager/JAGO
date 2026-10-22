import { z } from 'zod'
import { checkPassword, createAuthUser, identifierFor, rollbackUser } from '../_lib/accounts.js'
import { audit } from '../_lib/audit.js'
import { defineHandler } from '../_lib/http.js'
import { maskPhone } from '../../src/lib/phone.js'

export default defineHandler({
  auth: 'admin',
  rateLimit: { name: 'create-shop', limit: 20, windowSec: 3600 },
  schema: z
    .object({
      shop_name: z.string().trim().min(1).max(200),
      owner_name: z.string().trim().min(1).max(200),
      phone: z.string().trim().min(8).max(32),
      email: z.string().trim().max(200).optional(),
      password: z.string().min(8).max(128),
      notes: z.string().trim().max(2000).optional(),
      /** Demande d'inscription d'où vient ce compte : elle passe automatiquement à « créé ». */
      signup_id: z.string().uuid().optional(),
    })
    .strict(),
  run: async ({ admin, userId }, input) => {
    const id = identifierFor(input.phone, input.email)
    checkPassword(input.password, [input.phone, input.shop_name])
    const newUserId = await createAuthUser(admin, id.email, input.password)
    // Création atomique boutique + propriétaire côté SQL ; si elle échoue, le compte Auth est supprimé.
    const res = await admin.rpc('admin_create_shop', {
      p_user_id: newUserId,
      p_shop_name: input.shop_name,
      p_owner_name: input.owner_name,
      p_phone: id.phone,
      p_notes: input.notes ?? null,
    })
    const shopId: unknown = res.data
    if (res.error || typeof shopId !== 'string') {
      await rollbackUser(admin, newUserId)
      throw new Error(res.error?.message ?? 'create_shop_failed')
    }
    if (input.signup_id) {
      // Le compte existe déjà : un échec ici ne doit pas faire échouer la création (l'admin peut changer le statut à la main).
      await admin
        .from('signup_requests')
        .update({ status: 'created', shop_id: shopId, handled_at: new Date().toISOString() })
        .eq('id', input.signup_id)
    }
    await audit(admin, {
      userId,
      shopId,
      action: 'create_shop',
      details: { shop_name: input.shop_name, phone: maskPhone(id.phone) },
    })
    return { shop_id: shopId, identifier: id.email }
  },
})
