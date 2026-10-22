import { newId } from '@/lib/id'
import { computeSale, type PaymentInput } from '@/lib/sale'
import {
  assertManager,
  isManager,
  newBase,
  nowIso,
  putRow,
  ValidationError,
  type Ctx,
} from '../ctx'
import { recomputeBalances, recomputeStock } from '../derived'
import type { CartLine } from '../dexie'
import { nextReceiptNo } from '../meta'
import type { Sale } from '../schemas'
import { writeMovement } from './stock'

export interface SaleInput {
  lines: readonly CartLine[]
  discount: number
  payments: readonly PaymentInput[]
  customer_id: string | null
  note?: string
  /** Remise ou prix modifié au-delà de ce que le caissier peut faire seul (signalé dans « Contrôle »). */
  override?: boolean
}
export interface SaleResult {
  saleId: string
  receiptNo: string
}

/**
 * Coût unitaire mémorisé sur la ligne. Pour un montant libre (unités…), le « prix d'achat » du produit est un
 * POURCENTAGE du montant vendu (95 = on paie 95 % de ce qu'on encaisse, soit 5 % de marge).
 */
export function lineCost(
  line: { open?: boolean; unit_price: number },
  cost: number | undefined,
): number | null {
  if (cost === undefined) return null
  return line.open ? Math.round((line.unit_price * Math.min(100, cost)) / 100) : cost
}

/**
 * Crée une vente en UNE transaction : vente, lignes, paiements, mouvements de stock, écriture de crédit,
 * caches et outbox. Soit tout est écrit, soit rien. Le stock peut passer sous zéro (jamais bloquant).
 */
export async function createSale(ctx: Ctx, input: SaleInput): Promise<SaleResult> {
  if (input.lines.length === 0) throw new ValidationError('Le panier est vide.')
  for (const l of input.lines) {
    if (
      !(l.qty > 0) ||
      !Number.isInteger(l.unit_price) ||
      l.unit_price < 0 ||
      l.line_discount < 0
    ) {
      throw new ValidationError(`Ligne invalide : ${l.name}.`)
    }
  }
  const calc = computeSale(input.lines, input.discount, input.payments)
  if (calc.credit_amount > 0 && !input.customer_id)
    throw new ValidationError('Choisissez un client pour enregistrer un crédit.')
  const when = ctx.now ? ctx.now() : new Date()

  return ctx.db.transaction('rw', ctx.db.tables, async () => {
    const saleId = newId()
    const receiptNo = await nextReceiptNo(ctx.db, when, ctx.deviceShort)
    const costs = isManager(ctx)
      ? await ctx.db.product_costs.bulkGet(calc.lines.map((l) => l.product_id))
      : []
    const sale: Sale = {
      ...newBase(ctx, saleId),
      receipt_no: receiptNo,
      customer_id: input.customer_id,
      subtotal: calc.subtotal,
      discount: calc.discount,
      total: calc.total,
      paid_total: calc.paid_total,
      credit_amount: calc.credit_amount,
      status: 'completed',
      voided_at: null,
      voided_by: null,
      void_reason: null,
      note: input.note?.trim() || null,
      override: input.override === true,
      device_id: ctx.deviceId,
      fiscal: null,
    }
    await putRow(ctx, 'sales', sale, 'insert')
    for (const [index, line] of calc.lines.entries()) {
      await putRow(
        ctx,
        'sale_items',
        {
          ...newBase(ctx, newId()),
          sale_id: saleId,
          product_id: line.product_id,
          name_snapshot: line.name,
          qty: line.qty,
          unit_price: line.unit_price,
          list_price_snapshot: line.list_price,
          cost_snapshot: lineCost(line, costs[index]?.cost_price),
          line_discount: line.line_discount,
          line_total: line.line_total,
        },
        'insert',
      )
    }
    for (const p of calc.payments) {
      await putRow(
        ctx,
        'sale_payments',
        { ...newBase(ctx, newId()), sale_id: saleId, method: p.method, amount: p.amount },
        'insert',
      )
    }
    const tracked = calc.lines.filter((l) => l.track_stock)
    for (const line of tracked)
      await writeMovement(ctx, {
        product_id: line.product_id,
        type: 'sale',
        qty: -line.qty,
        sale_id: saleId,
      })
    if (calc.credit_amount > 0 && input.customer_id) {
      await putRow(
        ctx,
        'customer_ledger',
        {
          ...newBase(ctx, newId()),
          customer_id: input.customer_id,
          type: 'credit_sale',
          amount: calc.credit_amount,
          method: null,
          sale_id: saleId,
          note: null,
          device_id: ctx.deviceId,
        },
        'insert',
      )
      await recomputeBalances(ctx.db, [input.customer_id])
    }
    await recomputeStock(
      ctx.db,
      tracked.map((l) => l.product_id),
    )
    return { saleId, receiptNo }
  })
}

/** Annulation (owner/manager) : remet le stock, inverse le crédit client, marque la vente. Jamais de suppression. */
export async function voidSale(ctx: Ctx, saleId: string, reason: string): Promise<void> {
  assertManager(ctx)
  if (!reason.trim()) throw new ValidationError('Indiquez le motif de l’annulation.')
  await ctx.db.transaction('rw', ctx.db.tables, async () => {
    const sale = await ctx.db.sales.get(saleId)
    if (!sale) throw new ValidationError('Vente introuvable.')
    if (sale.status === 'voided') throw new ValidationError('Cette vente est déjà annulée.')
    const items = await ctx.db.sale_items.where('sale_id').equals(saleId).toArray()
    const products = await ctx.db.products.bulkGet(items.map((i) => i.product_id))
    const touched: string[] = []
    for (const [index, item] of items.entries()) {
      if (!products[index]?.track_stock) continue
      await writeMovement(ctx, {
        product_id: item.product_id,
        type: 'sale_void',
        qty: item.qty,
        sale_id: saleId,
        note: 'Annulation de vente',
      })
      touched.push(item.product_id)
    }
    if (sale.credit_amount > 0 && sale.customer_id) {
      await putRow(
        ctx,
        'customer_ledger',
        {
          ...newBase(ctx, newId()),
          customer_id: sale.customer_id,
          type: 'adjustment',
          amount: -sale.credit_amount,
          method: null,
          sale_id: saleId,
          note: `Annulation de la vente ${sale.receipt_no}`,
          device_id: ctx.deviceId,
        },
        'insert',
      )
      await recomputeBalances(ctx.db, [sale.customer_id])
    }
    const now = nowIso(ctx)
    await putRow(
      ctx,
      'sales',
      {
        ...sale,
        status: 'voided',
        voided_at: now,
        voided_by: ctx.userId,
        void_reason: reason.trim(),
        updated_at: now,
      },
      'upsert',
    )
    await recomputeStock(ctx.db, touched)
  })
}
