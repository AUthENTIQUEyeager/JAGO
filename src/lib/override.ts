import type { CartLine } from '@/db/dexie'
import type { Role } from '@/db/schemas'
import type { ShopSettings } from '@/db/settings'
import { lineTotal } from './money'

/** Raisons pour lesquelles une vente de caissier demande l'accord du gérant. Vide = aucune validation nécessaire. */
export function approvalReasons(
  role: Role,
  settings: ShopSettings,
  lines: readonly CartLine[],
  globalDiscount: number,
): string[] {
  if (role !== 'cashier') return []
  const reasons: string[] = []
  const gross = lines.reduce((s, l) => s + lineTotal(l.qty, l.unit_price), 0)
  const discount = lines.reduce((s, l) => s + l.line_discount, 0) + globalDiscount
  if (!settings.cashier_can_edit_price && lines.some((l) => l.unit_price !== l.list_price))
    reasons.push('Prix modifié')
  if (discount > 0) {
    if (!settings.cashier_can_discount) reasons.push('Remise non autorisée au caissier')
    else if (gross > 0 && (discount / gross) * 100 > settings.discount_cap_pct)
      reasons.push(`Remise supérieure à ${settings.discount_cap_pct} %`)
  }
  return reasons
}
