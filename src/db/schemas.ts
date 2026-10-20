import { z } from 'zod'

/** Schémas des lignes (miroir du SQL). Servent à valider tout ce qui vient du réseau. */
const ns = z
  .string()
  .nullish()
  .transform((v) => v ?? null)
const num = z.coerce.number()
const nnum = z.preprocess(
  (v) => (v === null || v === undefined ? null : Number(v)),
  z.number().nullable(),
)
const id = z.string().uuid()

export const PAYMENT_METHODS = ['cash', 'orange_money', 'moov_money', 'wave', 'other'] as const
export const MOVEMENT_TYPES = [
  'opening',
  'purchase',
  'sale',
  'sale_void',
  'return_in',
  'adjustment',
  'loss',
] as const
export const LEDGER_TYPES = ['credit_sale', 'payment', 'adjustment'] as const
export const ROLES = ['owner', 'manager', 'cashier'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type Role = (typeof ROLES)[number]

const base = {
  id,
  shop_id: id,
  created_at: z.string(),
  updated_at: z.string(),
  server_updated_at: ns,
  deleted_at: ns,
  created_by: ns,
}

export const TABLE_SCHEMAS = {
  categories: z.object({ ...base, name: z.string() }),
  suppliers: z.object({ ...base, name: z.string(), phone: ns, note: ns }),
  customers: z.object({
    ...base,
    name: z.string(),
    phone: ns,
    address: ns,
    note: ns,
    credit_limit: nnum,
  }),
  products: z.object({
    ...base,
    name: z.string(),
    kind: z.enum(['product', 'service']),
    barcode: ns,
    sku: ns,
    category_id: ns,
    unit: z.string(),
    sale_price: num,
    wholesale_price: nnum,
    track_stock: z.boolean(),
    low_stock_threshold: num,
    is_active: z.boolean(),
  }),
  product_costs: z.object({ ...base, cost_price: num }),
  sales: z.object({
    ...base,
    receipt_no: z.string(),
    customer_id: ns,
    subtotal: num,
    discount: num,
    total: num,
    paid_total: num,
    credit_amount: num,
    status: z.enum(['completed', 'voided']),
    voided_at: ns,
    voided_by: ns,
    void_reason: ns,
    note: ns,
    override: z.boolean().default(false),
    device_id: ns,
    fiscal: z
      .unknown()
      .optional()
      .transform((v) => v ?? null),
  }),
  sale_items: z.object({
    ...base,
    sale_id: id,
    product_id: id,
    name_snapshot: z.string(),
    qty: num,
    unit_price: num,
    list_price_snapshot: nnum,
    cost_snapshot: nnum,
    line_discount: num,
    line_total: num,
  }),
  sale_payments: z.object({ ...base, sale_id: id, method: z.enum(PAYMENT_METHODS), amount: num }),
  stock_movements: z.object({
    ...base,
    product_id: id,
    type: z.enum(MOVEMENT_TYPES),
    qty: num,
    unit_cost: nnum,
    supplier_id: ns,
    sale_id: ns,
    note: ns,
    device_id: ns,
  }),
  customer_ledger: z.object({
    ...base,
    customer_id: id,
    type: z.enum(LEDGER_TYPES),
    amount: num,
    method: z
      .enum(PAYMENT_METHODS)
      .nullish()
      .transform((v) => v ?? null),
    sale_id: ns,
    note: ns,
    device_id: ns,
  }),
  expenses: z.object({
    ...base,
    label: z.string(),
    category: ns,
    amount: num,
    expense_date: z.string(),
  }),
} as const

export type TableName = keyof typeof TABLE_SCHEMAS
export type Row<T extends TableName> = z.infer<(typeof TABLE_SCHEMAS)[T]>

export type Category = Row<'categories'>
export type Supplier = Row<'suppliers'>
export type Customer = Row<'customers'>
export type Product = Row<'products'>
export type ProductCost = Row<'product_costs'>
export type Sale = Row<'sales'>
export type SaleItem = Row<'sale_items'>
export type SalePayment = Row<'sale_payments'>
export type StockMovement = Row<'stock_movements'>
export type LedgerEntry = Row<'customer_ledger'>
export type Expense = Row<'expenses'>

/** Ordre de pull / de création (les parents avant les enfants). */
export const SYNC_TABLES = [
  'categories',
  'suppliers',
  'customers',
  'products',
  'product_costs',
  'sales',
  'sale_items',
  'sale_payments',
  'stock_movements',
  'customer_ledger',
  'expenses',
] as const satisfies readonly TableName[]

/** Tables en ajout seulement : jamais modifiées, envoi avec ignoreDuplicates. */
export const APPEND_ONLY: ReadonlySet<TableName> = new Set<TableName>([
  'sale_items',
  'sale_payments',
  'stock_movements',
  'customer_ledger',
])

/** Colonnes que le client n'envoie jamais (le serveur les impose). */
export const SERVER_ONLY_COLUMNS = ['shop_id', 'created_by', 'server_updated_at'] as const
