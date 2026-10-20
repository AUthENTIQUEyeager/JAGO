import { z } from 'zod'
import { getMeta } from './meta'
import type { JagoDb } from './dexie'

export const shopSettingsSchema = z.object({
  address: z.string().max(300).default(''),
  phone: z.string().max(32).default(''),
  footer: z.string().max(300).default('Merci de votre visite !'),
  paper: z.union([z.literal(58), z.literal(80)]).default(58),
  cashier_can_edit_price: z.boolean().default(false),
  cashier_can_discount: z.boolean().default(true),
  discount_cap_pct: z.number().min(0).max(100).default(10),
  idle_minutes: z.number().int().min(1).max(120).default(5),
  manager_pin: z.object({ salt: z.string(), hash: z.string(), iterations: z.number() }).optional(),
})
export type ShopSettings = z.infer<typeof shopSettingsSchema>

export const shopSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['active', 'blocked']),
  block_message: z.string().nullable().optional(),
  settings: z.unknown().optional(),
})
export type ShopSnapshot = z.infer<typeof shopSnapshotSchema>

export function parseSettings(raw: unknown): ShopSettings {
  const parsed = shopSettingsSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : shopSettingsSchema.parse({})
}

export async function loadShopSnapshot(
  db: JagoDb,
): Promise<{ shop: ShopSnapshot; settings: ShopSettings } | null> {
  const shop = await getMeta(db, 'shop_snapshot', shopSnapshotSchema)
  return shop ? { shop, settings: parseSettings(shop.settings) } : null
}
