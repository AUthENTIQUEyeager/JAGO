import { z } from 'zod'
import type { Ctx } from '@/db/ctx'
import type { JagoDb } from '@/db/dexie'
import { ROLES } from '@/db/schemas'
import type { ShopSettings, ShopSnapshot } from '@/db/settings'

export const profileSchema = z.object({
  shop_id: z.string().uuid(),
  role: z.enum(ROLES),
  full_name: z.string(),
  phone: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  is_active: z.boolean(),
  must_change_password: z.boolean(),
  terms_version: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
})
export type Profile = z.infer<typeof profileSchema>

export const platformSchema = z.object({
  support_phone: z.string().default(''),
  support_whatsapp: z.string().default(''),
  terms_version: z.string().default('1'),
  terms_text: z.string().default(''),
  maintenance_message: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
})
export type PlatformSettings = z.infer<typeof platformSchema>

export interface ReadySession {
  status: 'ready'
  userId: string
  email: string
  profile: Profile
  shop: ShopSnapshot
  settings: ShopSettings
  platform: PlatformSettings
  db: JagoDb
  ctx: Ctx
  /** Entré avec les données en cache, sans pouvoir joindre le serveur. */
  offline: boolean
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'admin'; userId: string; email: string }
  | { status: 'disabled' }
  | { status: 'needsNetwork' }
  | ReadySession
