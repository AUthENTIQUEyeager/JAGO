import Dexie, { type Table } from 'dexie'
import type {
  Category,
  Customer,
  Expense,
  LedgerEntry,
  Product,
  ProductCost,
  Sale,
  SaleItem,
  SalePayment,
  StockMovement,
  Supplier,
  TableName,
} from './schemas'

export interface OutboxItem {
  seq?: number
  table: TableName
  op: 'insert' | 'upsert'
  record_id: string
  payload: Record<string, unknown>
  created_at: string
  attempts: number
  last_error: string | null
  next_retry_at: number
}
export interface FailedItem extends OutboxItem {
  failed_at: string
  reason: string
}
export interface MetaRow {
  key: string
  value: unknown
}
export interface StockCache {
  product_id: string
  qty: number
}
export interface BalanceCache {
  customer_id: string
  balance: number
}
export interface CartLine {
  product_id: string
  name: string
  qty: number
  unit_price: number
  list_price: number
  line_discount: number
  track_stock: boolean
}
export interface HeldCart {
  id: string
  label: string
  lines: CartLine[]
  customer_id: string | null
  discount: number
  created_at: string
  updated_at: string
}

/** Version courante du schéma. Les versions ne font que croître, les migrations sont additives. */
export const SCHEMA_VERSION = 2

export const V1_STORES = {
  categories: 'id, name, updated_at',
  suppliers: 'id, name, updated_at',
  customers: 'id, name, phone, updated_at',
  products: 'id, barcode, name, category_id, updated_at',
  product_costs: 'id',
  sales: 'id, created_at, customer_id, status',
  sale_items: 'id, sale_id, product_id',
  sale_payments: 'id, sale_id',
  stock_movements: 'id, product_id, created_at',
  customer_ledger: 'id, customer_id, created_at',
  expenses: 'id, expense_date, created_at',
  outbox: '++seq, table, record_id, next_retry_at',
  outbox_failed: '++seq, table',
  meta: 'key',
  stock_cache: 'product_id',
  balance_cache: 'customer_id',
} as const

export class JagoDb extends Dexie {
  categories!: Table<Category, string>
  suppliers!: Table<Supplier, string>
  customers!: Table<Customer, string>
  products!: Table<Product, string>
  product_costs!: Table<ProductCost, string>
  sales!: Table<Sale, string>
  sale_items!: Table<SaleItem, string>
  sale_payments!: Table<SalePayment, string>
  stock_movements!: Table<StockMovement, string>
  customer_ledger!: Table<LedgerEntry, string>
  expenses!: Table<Expense, string>
  outbox!: Table<OutboxItem, number>
  outbox_failed!: Table<FailedItem, number>
  meta!: Table<MetaRow, string>
  stock_cache!: Table<StockCache, string>
  balance_cache!: Table<BalanceCache, string>
  held_carts!: Table<HeldCart, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores(V1_STORES)
    // v2 (additive) : paniers en attente + index du numéro de reçu. Aucune donnée n'est touchée.
    this.version(2)
      .stores({
        held_carts: 'id, updated_at',
        sales: 'id, created_at, customer_id, status, receipt_no',
      })
      .upgrade(async (tx) => {
        await tx.table('meta').put({ key: 'app_data_version', value: 2 })
      })
  }
}

type AnyRow = { id: string } & Record<string, unknown>

/** Accès générique à une table synchronisée (un seul endroit où le typage est relâché). */
export function tableOf(db: JagoDb, name: TableName): Table<AnyRow, string> {
  return db.table(name) as unknown as Table<AnyRow, string>
}

export function dbName(shopId: string): string {
  return `jago_${shopId}`
}

let current: JagoDb | null = null
export function openShopDb(shopId: string): JagoDb {
  if (current?.name === dbName(shopId)) return current
  current?.close()
  current = new JagoDb(dbName(shopId))
  return current
}
export function getDb(): JagoDb {
  if (!current) throw new Error('Aucune base locale ouverte.')
  return current
}
export function closeShopDb(): void {
  current?.close()
  current = null
}
