import { z } from 'zod'
import { newId } from '@/lib/id'
import {
  assertManager,
  isManager,
  newBase,
  nowIso,
  PermissionError,
  putRow,
  ValidationError,
  type Ctx,
} from '../ctx'
import { recomputeBalances } from '../derived'
import {
  PAYMENT_METHODS,
  type Customer,
  type Expense,
  type PaymentMethod,
  type Supplier,
} from '../schemas'

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)
const customerSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200),
  phone: text(32),
  address: text(300),
  note: text(1000),
  credit_limit: z
    .number()
    .int()
    .min(0)
    .max(1_000_000_000_000)
    .nullish()
    .transform((v) => v ?? null),
})
const supplierSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200),
  phone: text(32),
  note: text(1000),
})
const expenseSchema = z.object({
  label: z.string().trim().min(1, 'Le libellé est obligatoire.').max(200),
  category: text(100),
  amount: z.number().int().min(1, 'Le montant doit être supérieur à zéro.').max(1_000_000_000_000),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'),
})

function check<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Données invalides.')
  return parsed.data
}

/** Tout le monde peut créer un client ; seule la modification est réservée au gérant. */
export async function saveCustomer(
  ctx: Ctx,
  input: z.input<typeof customerSchema>,
  id?: string,
): Promise<string> {
  const data = check(customerSchema, input)
  if (id && !isManager(ctx)) throw new PermissionError('Seul le gérant peut modifier un client.')
  return ctx.db.transaction('rw', ctx.db.tables, async () => {
    const existing = id ? await ctx.db.customers.get(id) : undefined
    const customerId = existing?.id ?? newId()
    const row: Customer = {
      ...(existing ?? newBase(ctx, customerId)),
      ...data,
      updated_at: nowIso(ctx),
    }
    await putRow(ctx, 'customers', row, existing ? 'upsert' : 'insert')
    return customerId
  })
}

/** Encaissement d'une dette : le solde du client diminue (écriture négative). */
export async function recordDebtPayment(
  ctx: Ctx,
  input: { customer_id: string; amount: number; method: PaymentMethod; note?: string },
): Promise<void> {
  if (!Number.isInteger(input.amount) || input.amount <= 0)
    throw new ValidationError('Le montant doit être supérieur à zéro.')
  if (!PAYMENT_METHODS.includes(input.method))
    throw new ValidationError('Mode de paiement invalide.')
  await ctx.db.transaction('rw', ctx.db.tables, async () => {
    await putRow(
      ctx,
      'customer_ledger',
      {
        ...newBase(ctx, newId()),
        customer_id: input.customer_id,
        type: 'payment',
        amount: -input.amount,
        method: input.method,
        sale_id: null,
        note: input.note?.trim() || null,
        device_id: ctx.deviceId,
      },
      'insert',
    )
    await recomputeBalances(ctx.db, [input.customer_id])
  })
}

export async function adjustBalance(
  ctx: Ctx,
  input: { customer_id: string; amount: number; note: string },
): Promise<void> {
  assertManager(ctx)
  if (!Number.isInteger(input.amount) || input.amount === 0)
    throw new ValidationError('Le montant est invalide.')
  if (!input.note.trim()) throw new ValidationError('Indiquez le motif.')
  await ctx.db.transaction('rw', ctx.db.tables, async () => {
    await putRow(
      ctx,
      'customer_ledger',
      {
        ...newBase(ctx, newId()),
        customer_id: input.customer_id,
        type: 'adjustment',
        amount: input.amount,
        method: null,
        sale_id: null,
        note: input.note.trim(),
        device_id: ctx.deviceId,
      },
      'insert',
    )
    await recomputeBalances(ctx.db, [input.customer_id])
  })
}

/** Avertissement (jamais bloquant) si le plafond de crédit serait dépassé. */
export function creditLimitExceeded(
  balance: number,
  newCredit: number,
  limit: number | null,
): boolean {
  return limit !== null && balance + newCredit > limit
}

export async function saveSupplier(
  ctx: Ctx,
  input: z.input<typeof supplierSchema>,
  id?: string,
): Promise<string> {
  assertManager(ctx)
  const data = check(supplierSchema, input)
  return ctx.db.transaction('rw', ctx.db.tables, async () => {
    const existing = id ? await ctx.db.suppliers.get(id) : undefined
    const supplierId = existing?.id ?? newId()
    const row: Supplier = {
      ...(existing ?? newBase(ctx, supplierId)),
      ...data,
      updated_at: nowIso(ctx),
    }
    await putRow(ctx, 'suppliers', row, existing ? 'upsert' : 'insert')
    return supplierId
  })
}

export async function saveExpense(
  ctx: Ctx,
  input: z.input<typeof expenseSchema>,
  id?: string,
): Promise<string> {
  assertManager(ctx)
  const data = check(expenseSchema, input)
  return ctx.db.transaction('rw', ctx.db.tables, async () => {
    const existing = id ? await ctx.db.expenses.get(id) : undefined
    const expenseId = existing?.id ?? newId()
    const row: Expense = {
      ...(existing ?? newBase(ctx, expenseId)),
      ...data,
      updated_at: nowIso(ctx),
    }
    await putRow(ctx, 'expenses', row, existing ? 'upsert' : 'insert')
    return expenseId
  })
}

/** Suppression douce : la ligne reste, masquée de l'écran. */
export async function deleteExpense(ctx: Ctx, id: string): Promise<void> {
  assertManager(ctx)
  await ctx.db.transaction('rw', ctx.db.tables, async () => {
    const e = await ctx.db.expenses.get(id)
    if (e)
      await putRow(
        ctx,
        'expenses',
        { ...e, deleted_at: nowIso(ctx), updated_at: nowIso(ctx) },
        'upsert',
      )
  })
}
