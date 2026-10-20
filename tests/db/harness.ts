import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const root = (path: string) => fileURLToPath(new URL(`../../${path}`, import.meta.url))

export const ID = {
  ownerA: '00000000-0000-4000-8000-0000000000a1',
  managerA: '00000000-0000-4000-8000-0000000000a2',
  cashierA: '00000000-0000-4000-8000-0000000000a3',
  ownerB: '00000000-0000-4000-8000-0000000000b1',
  cashierB: '00000000-0000-4000-8000-0000000000b2',
  admin: '00000000-0000-4000-8000-0000000000ff',
  shopA: '10000000-0000-4000-8000-00000000000a',
  shopB: '10000000-0000-4000-8000-00000000000b',
  prodA: '20000000-0000-4000-8000-00000000000a',
  prodB: '20000000-0000-4000-8000-00000000000b',
  custA: '30000000-0000-4000-8000-00000000000a',
  custB: '30000000-0000-4000-8000-00000000000b',
  saleB: '40000000-0000-4000-8000-00000000000b',
}

export const BUSINESS_TABLES = [
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
] as const

export async function makeDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(readFileSync(root('supabase/tests/00_mock_supabase.sql'), 'utf8'))
  const files = readdirSync(root('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) await db.exec(readFileSync(root(`supabase/migrations/${file}`), 'utf8'))
  await db.exec(readFileSync(root('supabase/seed.sql'), 'utf8'))
  return db
}

export async function seedWorld(db: PGlite): Promise<void> {
  const {
    ownerA,
    managerA,
    cashierA,
    ownerB,
    cashierB,
    admin,
    shopA,
    shopB,
    prodA,
    prodB,
    custA,
    custB,
    saleB,
  } = ID
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ownerA}','oa@t'),('${managerA}','ma@t'),('${cashierA}','ca@t'),('${ownerB}','ob@t'),('${cashierB}','cb@t'),('${admin}','ad@t');
    insert into public.shops (id, name) values ('${shopA}','Boutique A'),('${shopB}','Boutique B');
    insert into public.profiles (user_id, shop_id, role, full_name, must_change_password) values
      ('${ownerA}','${shopA}','owner','Owner A',false),('${managerA}','${shopA}','manager','Manager A',false),
      ('${cashierA}','${shopA}','cashier','Cashier A',false),('${ownerB}','${shopB}','owner','Owner B',false),
      ('${cashierB}','${shopB}','cashier','Cashier B',false);
    insert into public.platform_admins (user_id) values ('${admin}');
    insert into public.categories (id, shop_id, name) values (gen_random_uuid(),'${shopA}','Cat A'),(gen_random_uuid(),'${shopB}','Cat B');
    insert into public.suppliers (id, shop_id, name) values (gen_random_uuid(),'${shopB}','Fourn B');
    insert into public.products (id, shop_id, name, sale_price) values ('${prodA}','${shopA}','Riz',1000),('${prodB}','${shopB}','Sucre',500);
    insert into public.product_costs (id, shop_id, cost_price) values ('${prodA}','${shopA}',600),('${prodB}','${shopB}',300);
    insert into public.customers (id, shop_id, name) values ('${custA}','${shopA}','Client A'),('${custB}','${shopB}','Client B');
    insert into public.sales (id, shop_id, receipt_no, subtotal, total, paid_total) values ('${saleB}','${shopB}','R-B',1000,1000,1000);
    insert into public.sale_items (id, shop_id, sale_id, product_id, name_snapshot, qty, unit_price, line_total)
      values (gen_random_uuid(),'${shopB}','${saleB}','${prodB}','Sucre',2,500,1000);
    insert into public.sale_payments (id, shop_id, sale_id, method, amount) values (gen_random_uuid(),'${shopB}','${saleB}','cash',1000);
    insert into public.stock_movements (id, shop_id, product_id, type, qty) values (gen_random_uuid(),'${shopB}','${prodB}','opening',10);
    insert into public.customer_ledger (id, shop_id, customer_id, type, amount) values (gen_random_uuid(),'${shopB}','${custB}','adjustment',500);
    insert into public.expenses (id, shop_id, label, amount, expense_date) values (gen_random_uuid(),'${shopB}','Loyer',1000,current_date);
  `)
}

/** Exécute `fn` avec l'identité d'un utilisateur (ou anonyme), comme le ferait Supabase. */
export async function as<T>(
  db: PGlite,
  userId: string | null,
  fn: () => Promise<T>,
  role = 'authenticated',
): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
  await db.exec(`set role ${role}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
  }
}

/** Code SQLSTATE de l'erreur levée par la requête, ou null si elle réussit. */
export async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : `inconnu:${String(error)}`
  }
}

export async function count(db: PGlite, sql: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`)
  return rows[0]?.n ?? -1
}
