import { lineTotal } from './money'
import type { CartLine } from '@/db/dexie'
import type { PaymentMethod } from '@/db/schemas'

export interface PaymentInput {
  method: PaymentMethod
  amount: number
}

export interface SaleComputation {
  lines: Array<CartLine & { line_total: number }>
  subtotal: number
  discount: number
  total: number
  paid_total: number
  credit_amount: number
  /** Monnaie à rendre (non enregistrée comme paiement). */
  change: number
  payments: PaymentInput[]
}

/**
 * Calcul pur d'une vente. Règles : remise globale bornée au sous-total ; les paiements enregistrés
 * ne dépassent jamais le total (l'excès est de la monnaie rendue) ; le reste est un crédit client.
 */
export function computeSale(
  lines: readonly CartLine[],
  discount: number,
  payments: readonly PaymentInput[],
): SaleComputation {
  const priced = lines.map((l) => ({
    ...l,
    line_total: lineTotal(l.qty, l.unit_price, l.line_discount),
  }))
  const subtotal = priced.reduce((s, l) => s + l.line_total, 0)
  const globalDiscount = Math.min(Math.max(0, Math.round(discount)), subtotal)
  const total = subtotal - globalDiscount
  const clean = payments.filter((p) => p.amount > 0).map((p) => ({ ...p }))
  const given = clean.reduce((s, p) => s + p.amount, 0)
  const paid_total = Math.min(given, total)
  let excess = given - paid_total
  // L'excès est retiré d'abord des espèces (monnaie rendue), puis des derniers paiements.
  const order = [...clean.keys()].sort(
    (a, b) => Number(clean[b]?.method === 'cash') - Number(clean[a]?.method === 'cash') || b - a,
  )
  for (const index of order) {
    const p = clean[index]
    if (!p || excess <= 0) continue
    const cut = Math.min(p.amount, excess)
    p.amount -= cut
    excess -= cut
  }
  return {
    lines: priced,
    subtotal,
    discount: globalDiscount,
    total,
    paid_total,
    credit_amount: total - paid_total,
    change: given - paid_total,
    payments: clean.filter((p) => p.amount > 0),
  }
}
