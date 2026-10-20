import { z } from 'zod'
import { newId } from '@/lib/id'
import { normalizeText } from '@/lib/text'
import { assertManager, newBase, nowIso, putRow, ValidationError, type Ctx } from '../ctx'
import { recomputeStock } from '../derived'
import type { JagoDb } from '../dexie'
import type { Category, Product } from '../schemas'

const money = z.number().int().min(0).max(1_000_000_000_000)

export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200),
  kind: z.enum(['product', 'service']).default('product'),
  barcode: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .transform((v) => v || null),
  sku: z
    .string()
    .trim()
    .max(64)
    .nullish()
    .transform((v) => v || null),
  category_id: z
    .string()
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  unit: z.string().trim().min(1).max(32).default('pièce'),
  sale_price: money,
  wholesale_price: money.nullish().transform((v) => v ?? null),
  cost_price: money.nullish().transform((v) => v ?? null),
  track_stock: z.boolean().default(true),
  low_stock_threshold: z.number().min(0).max(1_000_000).default(0),
  is_active: z.boolean().default(true),
  opening_qty: z.number().min(0).max(1_000_000).default(0),
})
export type ProductInput = z.input<typeof productInputSchema>

function parseInput(input: ProductInput) {
  const parsed = productInputSchema.safeParse(input)
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Données invalides.')
  return parsed.data
}

async function assertBarcodeFree(
  db: JagoDb,
  barcode: string | null,
  selfId: string | null,
): Promise<void> {
  if (!barcode) return
  const clash = await db.products
    .where('barcode')
    .equals(barcode)
    .filter((p) => p.id !== selfId && !p.deleted_at)
    .first()
  if (clash) throw new ValidationError(`Ce code-barres est déjà utilisé par « ${clash.name} ».`)
}

async function writeProduct(
  ctx: Ctx,
  data: ReturnType<typeof parseInput>,
  id?: string,
): Promise<string> {
  const existing = id ? await ctx.db.products.get(id) : undefined
  if (data.barcode) await assertBarcodeFree(ctx.db, data.barcode, existing?.id ?? null)
  const productId = existing?.id ?? newId()
  const row: Product = {
    ...(existing ?? newBase(ctx, productId)),
    name: data.name,
    kind: data.kind,
    barcode: data.barcode,
    sku: data.sku,
    category_id: data.category_id,
    unit: data.unit,
    sale_price: data.sale_price,
    wholesale_price: data.wholesale_price,
    track_stock: data.kind === 'service' ? false : data.track_stock,
    low_stock_threshold: data.low_stock_threshold,
    is_active: data.is_active,
    updated_at: nowIso(ctx),
  }
  await putRow(ctx, 'products', row, existing ? 'upsert' : 'insert')
  if (data.cost_price !== null) {
    const cost = await ctx.db.product_costs.get(productId)
    await putRow(
      ctx,
      'product_costs',
      {
        ...(cost ?? newBase(ctx, productId)),
        cost_price: data.cost_price,
        updated_at: nowIso(ctx),
      },
      cost ? 'upsert' : 'insert',
    )
  }
  if (!existing && data.opening_qty > 0 && row.track_stock) {
    await putRow(
      ctx,
      'stock_movements',
      {
        ...newBase(ctx, newId()),
        product_id: productId,
        type: 'opening',
        qty: data.opening_qty,
        unit_cost: data.cost_price,
        supplier_id: null,
        sale_id: null,
        note: 'Stock de départ',
        device_id: ctx.deviceId,
      },
      'insert',
    )
    await recomputeStock(ctx.db, [productId])
  }
  return productId
}

export async function saveProduct(ctx: Ctx, input: ProductInput, id?: string): Promise<string> {
  assertManager(ctx)
  const data = parseInput(input)
  return ctx.db.transaction('rw', ctx.db.tables, () => writeProduct(ctx, data, id))
}

export async function setProductActive(ctx: Ctx, id: string, active: boolean): Promise<void> {
  assertManager(ctx)
  await ctx.db.transaction('rw', ctx.db.tables, async () => {
    const p = await ctx.db.products.get(id)
    if (p)
      await putRow(ctx, 'products', { ...p, is_active: active, updated_at: nowIso(ctx) }, 'upsert')
  })
}

export async function saveCategory(ctx: Ctx, name: string, id?: string): Promise<string> {
  assertManager(ctx)
  const clean = name.trim()
  if (!clean || clean.length > 200)
    throw new ValidationError('Le nom de la catégorie est obligatoire.')
  return ctx.db.transaction('rw', ctx.db.tables, async () => {
    const existing = id ? await ctx.db.categories.get(id) : undefined
    const categoryId = existing?.id ?? newId()
    const row: Category = {
      ...(existing ?? newBase(ctx, categoryId)),
      name: clean,
      updated_at: nowIso(ctx),
    }
    await putRow(ctx, 'categories', row, existing ? 'upsert' : 'insert')
    return categoryId
  })
}

export interface ImportReport {
  created: number
  errors: Array<{ line: number; message: string }>
}

/** Import en bloc (déjà validé et prévisualisé par l'écran). Chaque ligne invalide est signalée, rien n'est ignoré en silence. */
export async function importProducts(ctx: Ctx, rows: ProductInput[]): Promise<ImportReport> {
  assertManager(ctx)
  const report: ImportReport = { created: 0, errors: [] }
  const seen = new Set<string>()
  for (let start = 0; start < rows.length; start += 200) {
    await ctx.db.transaction('rw', ctx.db.tables, async () => {
      for (const [offset, input] of rows.slice(start, start + 200).entries()) {
        const line = start + offset + 2
        try {
          const data = parseInput(input)
          if (data.barcode && seen.has(data.barcode))
            throw new ValidationError('Code-barres en double dans le fichier.')
          await writeProduct(ctx, data)
          if (data.barcode) seen.add(data.barcode)
          report.created++
        } catch (error) {
          if (!(error instanceof ValidationError)) throw error
          report.errors.push({ line, message: error.message })
        }
      }
    })
  }
  return report
}

/** Recherche insensible aux accents et à la casse (nom, code-barres, référence), limitée à 50 résultats. */
export async function searchProducts(
  db: JagoDb,
  query: string,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<Product[]> {
  const limit = opts.limit ?? 50
  const q = normalizeText(query)
  const out: Product[] = []
  await db.products
    .orderBy('name')
    .until(() => out.length >= limit)
    .each((p) => {
      if (p.deleted_at || (opts.activeOnly && !p.is_active)) return
      if (
        !q ||
        normalizeText(p.name).includes(q) ||
        p.barcode === query.trim() ||
        normalizeText(p.sku ?? '').includes(q)
      )
        out.push(p)
    })
  return out
}

export async function findByBarcode(db: JagoDb, code: string): Promise<Product | undefined> {
  const clean = code.trim()
  return clean
    ? db.products
        .where('barcode')
        .equals(clean)
        .filter((p) => p.is_active && !p.deleted_at)
        .first()
    : undefined
}
