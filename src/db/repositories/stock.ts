import { z } from 'zod'
import { newId } from '@/lib/id'
import { sumQty } from '@/lib/money'
import { assertManager, newBase, nowIso, putRow, ValidationError, type Ctx } from '../ctx'
import { recomputeStock } from '../derived'
import type { StockMovement } from '../schemas'

interface MovementInput {
  product_id: string
  type: StockMovement['type']
  qty: number
  unit_cost?: number | null
  supplier_id?: string | null
  sale_id?: string | null
  note?: string | null
}

/** Écrit un mouvement de stock (à appeler dans une transaction). */
export async function writeMovement(ctx: Ctx, m: MovementInput): Promise<void> {
  await putRow(
    ctx,
    'stock_movements',
    {
      ...newBase(ctx, newId()),
      product_id: m.product_id,
      type: m.type,
      qty: m.qty,
      unit_cost: m.unit_cost ?? null,
      supplier_id: m.supplier_id ?? null,
      sale_id: m.sale_id ?? null,
      note: m.note?.trim() || null,
      device_id: ctx.deviceId,
    },
    'insert',
  )
}

const qtySchema = z
  .number()
  .finite()
  .refine((v) => v !== 0 && Math.abs(v) <= 1_000_000, 'Quantité invalide.')

export async function addPurchase(
  ctx: Ctx,
  input: {
    product_id: string
    qty: number
    unit_cost: number
    supplier_id?: string | null
    note?: string
  },
): Promise<void> {
  assertManager(ctx)
  if (!(input.qty > 0) || !qtySchema.safeParse(input.qty).success)
    throw new ValidationError('La quantité doit être supérieure à zéro.')
  if (!Number.isInteger(input.unit_cost) || input.unit_cost < 0)
    throw new ValidationError('Le prix d’achat est invalide.')
  await ctx.db.transaction('rw', ctx.db.tables, async () => {
    await writeMovement(ctx, { ...input, type: 'purchase' })
    // Le dernier prix d'achat devient le prix d'achat courant du produit.
    const cost = await ctx.db.product_costs.get(input.product_id)
    await putRow(
      ctx,
      'product_costs',
      {
        ...(cost ?? newBase(ctx, input.product_id)),
        cost_price: input.unit_cost,
        updated_at: nowIso(ctx),
      },
      cost ? 'upsert' : 'insert',
    )
    await recomputeStock(ctx.db, [input.product_id])
  })
}

/** Ajustement (+ ou −) ou perte (toujours une sortie). Un motif est obligatoire. */
export async function addAdjustment(
  ctx: Ctx,
  input: { product_id: string; qty: number; kind: 'adjustment' | 'loss'; note: string },
): Promise<void> {
  assertManager(ctx)
  if (!qtySchema.safeParse(input.qty).success) throw new ValidationError('Quantité invalide.')
  if (!input.note.trim()) throw new ValidationError('Indiquez le motif.')
  const qty = input.kind === 'loss' ? -Math.abs(input.qty) : input.qty
  await ctx.db.transaction('rw', ctx.db.tables, async () => {
    await writeMovement(ctx, {
      product_id: input.product_id,
      type: input.kind,
      qty,
      note: input.note,
    })
    await recomputeStock(ctx.db, [input.product_id])
  })
}

/** Inventaire : les quantités comptées génèrent des ajustements pour les seuls écarts. Renvoie le nombre d'écarts. */
export async function applyInventory(
  ctx: Ctx,
  counts: ReadonlyArray<{ product_id: string; counted: number }>,
): Promise<number> {
  assertManager(ctx)
  let gaps = 0
  await ctx.db.transaction('rw', ctx.db.tables, async () => {
    for (const { product_id, counted } of counts) {
      if (!(counted >= 0)) throw new ValidationError('Une quantité comptée est invalide.')
      const current = (await ctx.db.stock_cache.get(product_id))?.qty ?? 0
      const delta = sumQty([counted, -current])
      if (delta === 0) continue
      await writeMovement(ctx, { product_id, type: 'adjustment', qty: delta, note: 'Inventaire' })
      gaps++
    }
    await recomputeStock(
      ctx.db,
      counts.map((c) => c.product_id),
    )
  })
  return gaps
}
