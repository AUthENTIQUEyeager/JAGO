import { z } from 'zod'

export const shopRowSchema = z.object({
  shop_id: z.string(),
  name: z.string(),
  owner_phone: z.string().nullable(),
  status: z.string(),
  last_seen_at: z.string().nullable(),
  pending_count: z.number(),
  app_version: z.string().nullable(),
  device_clock_skew_seconds: z.number().nullable(),
  sales_today: z.coerce.number(),
  sales_count_today: z.coerce.number(),
})
export const listSchema = z.object({ shops: z.array(shopRowSchema) })
export type ShopRow = z.infer<typeof shopRowSchema>

const DAY = 86_400_000
/** Alertes calculées à partir des agrégats : boutiques inactives, synchronisations bloquées, horloge décalée. */
export function alertsFor(s: ShopRow, now = Date.now()): string[] {
  const out: string[] = []
  if (s.status === 'blocked') return out
  if (!s.last_seen_at || now - Date.parse(s.last_seen_at) > 3 * DAY)
    out.push('Inactive depuis plus de 3 jours')
  if (s.pending_count > 50) out.push(`${s.pending_count} éléments en attente de synchronisation`)
  if (s.device_clock_skew_seconds !== null && Math.abs(s.device_clock_skew_seconds) > 600)
    out.push('Horloge d’un appareil décalée')
  return out
}
