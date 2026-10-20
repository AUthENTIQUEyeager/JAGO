import type { Product, Sale, SaleItem, StockMovement } from '@/db/schemas'

export interface ControlInput {
  sales: readonly Sale[]
  items: readonly SaleItem[]
  movements: readonly StockMovement[]
  products: readonly Product[]
  stock: ReadonlyMap<string, number>
  /** Seuil de remise (en %) au-delà duquel une vente est signalée. */
  discountThresholdPct: number
}

export interface ControlReport {
  belowListPrice: Array<{ sale: Sale; item: SaleItem; gap: number }>
  highDiscounts: Array<{ sale: Sale; pct: number }>
  voids: Array<{ user: string; count: number; total: number }>
  adjustments: StockMovement[]
  negativeStock: Array<{ product: Product; qty: number }>
  oddHours: Sale[]
  overrides: Sale[]
}

const BUSINESS_HOURS = { from: 6, to: 22 }

/** Détection (et non blocage) des écarts : le hors ligne interdit d'empêcher, on trace et on signale. */
export function analyzeControl(input: ControlInput): ControlReport {
  const sales = input.sales.filter((s) => !s.deleted_at)
  const done = sales.filter((s) => s.status === 'completed')
  const byId = new Map(sales.map((s) => [s.id, s]))
  const belowListPrice = input.items.flatMap((item) => {
    const sale = byId.get(item.sale_id)
    return sale &&
      sale.status === 'completed' &&
      item.list_price_snapshot !== null &&
      item.unit_price < item.list_price_snapshot
      ? [{ sale, item, gap: Math.round((item.list_price_snapshot - item.unit_price) * item.qty) }]
      : []
  })
  const highDiscounts = done.flatMap((sale) => {
    const lineDiscounts = input.items
      .filter((i) => i.sale_id === sale.id)
      .reduce((s, i) => s + i.line_discount, 0)
    const gross = sale.subtotal + lineDiscounts
    const pct = gross > 0 ? ((sale.discount + lineDiscounts) / gross) * 100 : 0
    return pct > input.discountThresholdPct ? [{ sale, pct: Math.round(pct * 10) / 10 }] : []
  })
  const voidMap = new Map<string, { user: string; count: number; total: number }>()
  for (const s of sales.filter((x) => x.status === 'voided')) {
    const key = s.voided_by ?? 'inconnu'
    const v = voidMap.get(key) ?? { user: key, count: 0, total: 0 }
    v.count++
    v.total += s.total
    voidMap.set(key, v)
  }
  return {
    belowListPrice,
    highDiscounts,
    voids: [...voidMap.values()].sort((a, b) => b.count - a.count),
    adjustments: input.movements
      .filter((m) => m.type === 'adjustment' || m.type === 'loss')
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    negativeStock: input.products.flatMap((product) => {
      const qty = input.stock.get(product.id) ?? 0
      return product.track_stock && qty < 0 ? [{ product, qty }] : []
    }),
    oddHours: done.filter((s) => {
      const hour = new Date(s.created_at).getUTCHours()
      return hour < BUSINESS_HOURS.from || hour >= BUSINESS_HOURS.to
    }),
    overrides: done.filter((s) => s.override),
  }
}

export function totalFindings(report: ControlReport): number {
  return (
    report.belowListPrice.length +
    report.highDiscounts.length +
    report.voids.length +
    report.adjustments.length +
    report.negativeStock.length +
    report.oddHours.length +
    report.overrides.length
  )
}

export interface SaleAnomaly {
  sale: Sale
  problem: string
}

/** Cohérence des ventes anciennes (> 1 h, car les lignes d'une vente peuvent arriver par lots séparés). */
export function saleAnomalies(
  sales: readonly Sale[],
  items: readonly SaleItem[],
  payments: ReadonlyArray<{ sale_id: string; amount: number }>,
  now: Date,
): SaleAnomaly[] {
  const itemSum = new Map<string, number>()
  for (const i of items) itemSum.set(i.sale_id, (itemSum.get(i.sale_id) ?? 0) + i.line_total)
  const paySum = new Map<string, number>()
  for (const p of payments) paySum.set(p.sale_id, (paySum.get(p.sale_id) ?? 0) + p.amount)
  const limit = now.getTime() - 3_600_000
  return sales.flatMap((sale) => {
    if (sale.deleted_at || sale.status !== 'completed' || Date.parse(sale.created_at) > limit)
      return []
    const out: SaleAnomaly[] = []
    if ((itemSum.get(sale.id) ?? 0) !== sale.subtotal)
      out.push({ sale, problem: 'La somme des lignes ne correspond pas au sous-total' })
    if ((paySum.get(sale.id) ?? 0) !== sale.paid_total)
      out.push({ sale, problem: 'La somme des paiements ne correspond pas au total payé' })
    return out
  })
}
