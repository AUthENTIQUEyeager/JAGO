import { dayKey, inRange, type DateRange } from './dates'
import type { Expense, Product, ProductCost, Sale, SaleItem, SalePayment } from '@/db/schemas'

export interface ReportInput {
  sales: readonly Sale[]
  items: readonly SaleItem[]
  payments: readonly SalePayment[]
  expenses: readonly Expense[]
  range: DateRange
}

export interface Report {
  revenue: number
  salesCount: number
  grossProfit: number
  /** Faux si certaines lignes n'ont pas de prix d'achat connu (bénéfice alors sous-estimé). */
  profitComplete: boolean
  expensesTotal: number
  netProfit: number
  topProducts: Array<{ product_id: string; name: string; qty: number; revenue: number }>
  byCashier: Array<{ user: string; count: number; total: number }>
  byMethod: Array<{ method: string; amount: number }>
  byDay: Array<{ day: string; total: number }>
}

const live = <T extends { deleted_at: string | null }>(row: T) => !row.deleted_at

/** Agrégations d'une période. Les ventes annulées ne comptent jamais. Tout est calculé en local depuis Dexie. */
export function buildReport({ sales, items, payments, expenses, range }: ReportInput): Report {
  const included = sales.filter(
    (s) => live(s) && s.status === 'completed' && inRange(s.created_at, range),
  )
  const ids = new Set(included.map((s) => s.id))
  const bySale = new Map<string, SaleItem[]>()
  for (const i of items) {
    if (!ids.has(i.sale_id)) continue
    const list = bySale.get(i.sale_id)
    if (list) list.push(i)
    else bySale.set(i.sale_id, [i])
  }

  let grossProfit = 0
  let profitComplete = true
  const products = new Map<
    string,
    { product_id: string; name: string; qty: number; revenue: number }
  >()
  for (const sale of included) {
    let saleProfit = -sale.discount
    for (const item of bySale.get(sale.id) ?? []) {
      if (item.cost_snapshot === null) profitComplete = false
      else saleProfit += item.line_total - Math.round(item.qty * item.cost_snapshot)
      const entry = products.get(item.product_id) ?? {
        product_id: item.product_id,
        name: item.name_snapshot,
        qty: 0,
        revenue: 0,
      }
      entry.qty = Math.round((entry.qty + item.qty) * 1000) / 1000
      entry.revenue += item.line_total
      products.set(item.product_id, entry)
    }
    grossProfit += saleProfit
  }

  const cashiers = new Map<string, { user: string; count: number; total: number }>()
  const days = new Map<string, number>()
  for (const s of included) {
    const key = s.created_by ?? 'inconnu'
    const c = cashiers.get(key) ?? { user: key, count: 0, total: 0 }
    c.count++
    c.total += s.total
    cashiers.set(key, c)
    days.set(dayKey(s.created_at), (days.get(dayKey(s.created_at)) ?? 0) + s.total)
  }
  const methods = new Map<string, number>()
  for (const p of payments)
    if (live(p) && ids.has(p.sale_id))
      methods.set(p.method, (methods.get(p.method) ?? 0) + p.amount)

  const fromDay = dayKey(range.from)
  const toDay = dayKey(range.to)
  const expensesTotal = expenses
    .filter((e) => live(e) && e.expense_date >= fromDay && e.expense_date < toDay)
    .reduce((sum, e) => sum + e.amount, 0)
  const revenue = included.reduce((sum, s) => sum + s.total, 0)

  return {
    revenue,
    salesCount: included.length,
    grossProfit,
    profitComplete,
    expensesTotal,
    netProfit: grossProfit - expensesTotal,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    byCashier: [...cashiers.values()].sort((a, b) => b.total - a.total),
    byMethod: [...methods.entries()]
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount),
    byDay: [...days.entries()]
      .map(([day, total]) => ({ day, total }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  }
}

/** Dettes ouvertes : somme des soldes clients positifs. */
export function openDebts(balances: ReadonlyArray<{ balance: number }>): number {
  return balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0)
}

/** Valeur du stock au prix d'achat (quantités négatives ignorées). */
export function stockValue(
  products: readonly Product[],
  stock: ReadonlyMap<string, number>,
  costs: ReadonlyMap<string, ProductCost>,
): number {
  return products.reduce((sum, p) => {
    if (!p.track_stock || p.deleted_at) return sum
    return sum + Math.round(Math.max(0, stock.get(p.id) ?? 0) * (costs.get(p.id)?.cost_price ?? 0))
  }, 0)
}

export function lowStock(
  products: readonly Product[],
  stock: ReadonlyMap<string, number>,
): Product[] {
  return products.filter(
    (p) =>
      p.track_stock &&
      p.is_active &&
      !p.deleted_at &&
      (stock.get(p.id) ?? 0) <= p.low_stock_threshold,
  )
}
