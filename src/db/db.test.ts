import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { computeSale } from '@/lib/sale'
import type { Ctx } from './ctx'
import { PermissionError, ValidationError } from './ctx'
import { recomputeAllDerived, recomputeStock } from './derived'
import { JagoDb, V1_STORES, type CartLine } from './dexie'
import { ensureDeviceIdentity, nextReceiptNo } from './meta'
import { exportBackup } from './backup'
import {
  saveProduct,
  saveCategory,
  searchProducts,
  importProducts,
  findByBarcode,
} from './repositories/products'
import { addAdjustment, addPurchase, applyInventory } from './repositories/stock'
import {
  adjustBalance,
  creditLimitExceeded,
  recordDebtPayment,
  saveCustomer,
  saveExpense,
  deleteExpense,
} from './repositories/people'
import { createSale, voidSale } from './repositories/sales'
import { holdCart, listHeldCarts, removeHeldCart } from './repositories/carts'

const SHOP = '10000000-0000-4000-8000-00000000000a'
const USER = '00000000-0000-4000-8000-0000000000a1'
let counter = 0

async function makeCtx(
  role: Ctx['role'] = 'owner',
  name = `t${++counter}-${Math.random()}`,
): Promise<Ctx> {
  const db = new JagoDb(name)
  const { deviceId, deviceShort } = await ensureDeviceIdentity(db)
  return {
    db,
    shopId: SHOP,
    userId: USER,
    role,
    deviceId,
    deviceShort,
    now: () => new Date('2026-10-18T10:00:00Z'),
  }
}

async function seedProduct(ctx: Ctx, over: Partial<Parameters<typeof saveProduct>[1]> = {}) {
  return saveProduct(ctx, {
    name: 'Riz 25kg',
    sale_price: 1000,
    cost_price: 600,
    opening_qty: 10,
    ...over,
  })
}
const line = (id: string, over: Partial<CartLine> = {}): CartLine => ({
  product_id: id,
  name: 'Riz',
  qty: 1,
  unit_price: 1000,
  list_price: 1000,
  line_discount: 0,
  track_stock: true,
  ...over,
})

describe('calcul de vente', () => {
  it('paiements multiples, crédit et monnaie rendue', () => {
    const multi = computeSale([line('p', { qty: 7 })], 0, [
      { method: 'cash', amount: 5000 },
      { method: 'orange_money', amount: 2000 },
    ])
    expect(multi).toMatchObject({ total: 7000, paid_total: 7000, credit_amount: 0, change: 0 })
    const credit = computeSale([line('p', { qty: 7 })], 0, [{ method: 'cash', amount: 3000 }])
    expect(credit).toMatchObject({ paid_total: 3000, credit_amount: 4000 })
    const change = computeSale([line('p', { qty: 3 })], 0, [{ method: 'cash', amount: 5000 }])
    expect(change).toMatchObject({ total: 3000, paid_total: 3000, change: 2000, credit_amount: 0 })
    expect(change.payments).toEqual([{ method: 'cash', amount: 3000 }])
  })
  it('remise bornée au sous-total ; la monnaie est prise sur les espèces', () => {
    expect(computeSale([line('p')], 5000, []).total).toBe(0)
    const mixed = computeSale([line('p', { qty: 2 })], 0, [
      { method: 'wave', amount: 1500 },
      { method: 'cash', amount: 1000 },
    ])
    expect(mixed.change).toBe(500)
    expect(mixed.payments).toEqual([
      { method: 'wave', amount: 1500 },
      { method: 'cash', amount: 500 },
    ])
  })
})

describe('création d’une vente (transaction atomique)', () => {
  it('écrit tout, dans l’ordre des dépendances, avec stock et crédit à jour', async () => {
    const ctx = await makeCtx()
    const p = await seedProduct(ctx)
    const c = await saveCustomer(ctx, { name: 'Awa' })
    await ctx.db.outbox.clear()
    const { saleId, receiptNo } = await createSale(ctx, {
      lines: [line(p, { qty: 3 })],
      discount: 500,
      payments: [{ method: 'cash', amount: 1000 }],
      customer_id: c,
    })
    expect(receiptNo).toMatch(/^261018-[a-z2-9]{4}-1$/)
    const sale = await ctx.db.sales.get(saleId)
    expect(sale).toMatchObject({
      subtotal: 3000,
      discount: 500,
      total: 2500,
      paid_total: 1000,
      credit_amount: 1500,
      status: 'completed',
    })
    expect(await ctx.db.sale_items.where('sale_id').equals(saleId).count()).toBe(1)
    expect((await ctx.db.sale_items.toArray())[0]?.cost_snapshot).toBe(600)
    expect(await ctx.db.sale_payments.count()).toBe(1)
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(7)
    expect((await ctx.db.balance_cache.get(c))?.balance).toBe(1500)
    const order = (await ctx.db.outbox.orderBy('seq').toArray()).map((o) => o.table)
    expect(order).toEqual([
      'sales',
      'sale_items',
      'sale_payments',
      'stock_movements',
      'customer_ledger',
    ])
    const first = (await ctx.db.outbox.orderBy('seq').first())!
    expect(first.payload).not.toHaveProperty('shop_id')
    expect(first.payload).not.toHaveProperty('created_by')
    expect(first.op).toBe('insert')
  })

  it('si une écriture échoue, rien n’est écrit (ni vente, ni stock, ni outbox)', async () => {
    const ctx = await makeCtx()
    const p = await seedProduct(ctx)
    await ctx.db.outbox.clear()
    const before = (await ctx.db.stock_cache.get(p))?.qty
    // Panne simulée en plein milieu de la transaction (après la vente et une partie des lignes).
    let calls = 0
    const failing: Ctx = {
      ...ctx,
      now: () => {
        if (++calls > 5) throw new Error('disque plein')
        return new Date('2026-10-18T10:00:00Z')
      },
    }
    await expect(
      createSale(failing, {
        lines: [line(p)],
        discount: 0,
        payments: [{ method: 'cash', amount: 1000 }],
        customer_id: null,
      }),
    ).rejects.toThrow('disque plein')
    expect(await ctx.db.sales.count()).toBe(0)
    expect(await ctx.db.sale_items.count()).toBe(0)
    expect(await ctx.db.outbox.count()).toBe(0)
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(before)
    expect(await ctx.db.meta.get(`receipt_counter:20261018`)).toBeUndefined()
  })

  it('refuse un crédit sans client, un panier vide et une ligne invalide, sans rien écrire', async () => {
    const ctx = await makeCtx()
    const p = await seedProduct(ctx)
    await ctx.db.outbox.clear()
    await expect(
      createSale(ctx, {
        lines: [line(p, { qty: 2 })],
        discount: 0,
        payments: [],
        customer_id: null,
      }),
    ).rejects.toThrow(ValidationError)
    await expect(
      createSale(ctx, { lines: [], discount: 0, payments: [], customer_id: null }),
    ).rejects.toThrow('vide')
    await expect(
      createSale(ctx, {
        lines: [line(p, { qty: 0 })],
        discount: 0,
        payments: [],
        customer_id: null,
      }),
    ).rejects.toThrow(ValidationError)
    expect(await ctx.db.outbox.count()).toBe(0)
  })

  it('autorise un stock négatif (course entre appareils) et ignore les services', async () => {
    const ctx = await makeCtx()
    const p = await seedProduct(ctx, { opening_qty: 1 })
    const service = await saveProduct(ctx, { name: 'Recharge', kind: 'service', sale_price: 500 })
    await createSale(ctx, {
      lines: [line(p, { qty: 3 }), line(service, { track_stock: false, unit_price: 500 })],
      discount: 0,
      payments: [{ method: 'cash', amount: 3500 }],
      customer_id: null,
    })
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(-2)
    expect(await ctx.db.stock_cache.get(service)).toBeUndefined()
  })

  it('le caissier ne connaît pas le prix d’achat (cost_snapshot nul)', async () => {
    const owner = await makeCtx('owner', 'shared-db')
    const p = await seedProduct(owner)
    const cashier = { ...owner, role: 'cashier' as const }
    await createSale(cashier, {
      lines: [line(p)],
      discount: 0,
      payments: [{ method: 'cash', amount: 1000 }],
      customer_id: null,
    })
    expect((await owner.db.sale_items.toArray())[0]?.cost_snapshot).toBeNull()
  })

  it('numéros de reçu : compteur par jour, distincts entre appareils', async () => {
    const a = await makeCtx()
    const b = await makeCtx()
    const day = new Date('2026-10-18T10:00:00Z')
    const na = await a.db.transaction('rw', a.db.meta, () =>
      nextReceiptNo(a.db, day, a.deviceShort),
    )
    const na2 = await a.db.transaction('rw', a.db.meta, () =>
      nextReceiptNo(a.db, day, a.deviceShort),
    )
    const nb = await b.db.transaction('rw', b.db.meta, () =>
      nextReceiptNo(b.db, day, b.deviceShort),
    )
    const nextDay = await a.db.transaction('rw', a.db.meta, () =>
      nextReceiptNo(a.db, new Date('2026-10-19T08:00:00Z'), a.deviceShort),
    )
    expect(na.endsWith('-1')).toBe(true)
    expect(na2.endsWith('-2')).toBe(true)
    expect(nextDay.startsWith('261019-') && nextDay.endsWith('-1')).toBe(true)
    expect(na.split('-')[1]).not.toBe(nb.split('-')[1])
  })
})

describe('annulation de vente', () => {
  it('remet le stock, inverse le crédit et marque la vente (sans la supprimer)', async () => {
    const ctx = await makeCtx()
    const p = await seedProduct(ctx)
    const c = await saveCustomer(ctx, { name: 'Awa' })
    const { saleId } = await createSale(ctx, {
      lines: [line(p, { qty: 4 })],
      discount: 0,
      payments: [{ method: 'cash', amount: 1000 }],
      customer_id: c,
    })
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(6)
    expect((await ctx.db.balance_cache.get(c))?.balance).toBe(3000)
    await voidSale(ctx, saleId, 'Erreur de caisse')
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(10)
    expect((await ctx.db.balance_cache.get(c))?.balance).toBe(0)
    expect(await ctx.db.sales.get(saleId)).toMatchObject({
      status: 'voided',
      void_reason: 'Erreur de caisse',
      voided_by: USER,
    })
    await expect(voidSale(ctx, saleId, 'encore')).rejects.toThrow('déjà annulée')
    const last = (await ctx.db.outbox.orderBy('seq').last())!
    expect(last).toMatchObject({ table: 'sales', op: 'upsert' })
  })
  it('est réservée au propriétaire et au gérant, avec un motif', async () => {
    const owner = await makeCtx('owner', 'void-db')
    const p = await seedProduct(owner)
    const { saleId } = await createSale(owner, {
      lines: [line(p)],
      discount: 0,
      payments: [{ method: 'cash', amount: 1000 }],
      customer_id: null,
    })
    await expect(voidSale({ ...owner, role: 'cashier' }, saleId, 'x')).rejects.toThrow(
      PermissionError,
    )
    await expect(voidSale(owner, saleId, '  ')).rejects.toThrow('motif')
  })
})

describe('stock et crédit : mouvements seulement', () => {
  it('pas de double comptage entre écriture locale et pull du même mouvement', async () => {
    const ctx = await makeCtx()
    const p = await seedProduct(ctx, { opening_qty: 5 })
    await addPurchase(ctx, { product_id: p, qty: 3, unit_cost: 650 })
    const movements = await ctx.db.stock_movements.toArray()
    await ctx.db.transaction('rw', ctx.db.tables, async () => {
      await ctx.db.stock_movements.bulkPut(
        movements.map((m) => ({ ...m, server_updated_at: '2026-10-18T10:00:01Z' })),
      )
      await recomputeStock(ctx.db, [p])
    })
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(8)
    expect((await ctx.db.product_costs.get(p))?.cost_price).toBe(650)
  })
  it('somme sans dérive décimale, pertes, ajustements et inventaire', async () => {
    const ctx = await makeCtx()
    const p = await seedProduct(ctx, { unit: 'kg', opening_qty: 0.1 })
    await addAdjustment(ctx, { product_id: p, qty: 0.2, kind: 'adjustment', note: 'Reçu' })
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(0.3)
    await addAdjustment(ctx, { product_id: p, qty: 0.1, kind: 'loss', note: 'Cassé' })
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(0.2)
    await expect(
      addAdjustment(ctx, { product_id: p, qty: 1, kind: 'loss', note: ' ' }),
    ).rejects.toThrow('motif')
    expect(await applyInventory(ctx, [{ product_id: p, counted: 0.2 }])).toBe(0)
    expect(await applyInventory(ctx, [{ product_id: p, counted: 5 }])).toBe(1)
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(5)
  })
  it('recalcule tout depuis les mouvements', async () => {
    const ctx = await makeCtx()
    const p = await seedProduct(ctx, { opening_qty: 4 })
    await ctx.db.stock_cache.clear()
    await recomputeAllDerived(ctx.db)
    expect((await ctx.db.stock_cache.get(p))?.qty).toBe(4)
  })
  it('encaissement de dette, ajustement du solde et plafond de crédit', async () => {
    const ctx = await makeCtx()
    const c = await saveCustomer(ctx, { name: 'Awa', credit_limit: 5000 })
    await adjustBalance(ctx, { customer_id: c, amount: 4000, note: 'Ancienne dette' })
    await recordDebtPayment(
      { ...ctx, role: 'cashier' },
      { customer_id: c, amount: 1500, method: 'wave' },
    )
    expect((await ctx.db.balance_cache.get(c))?.balance).toBe(2500)
    expect(creditLimitExceeded(2500, 3000, 5000)).toBe(true)
    expect(creditLimitExceeded(2500, 1000, null)).toBe(false)
    await expect(
      recordDebtPayment(ctx, { customer_id: c, amount: 0, method: 'cash' }),
    ).rejects.toThrow(ValidationError)
    await expect(saveCustomer({ ...ctx, role: 'cashier' }, { name: 'X' }, c)).rejects.toThrow(
      PermissionError,
    )
    expect(await saveCustomer({ ...ctx, role: 'cashier' }, { name: 'Nouveau client' })).toBeTruthy()
  })
})

describe('produits, dépenses, paniers, sauvegarde', () => {
  it('refuse les doublons de code-barres et cherche sans accents', async () => {
    const ctx = await makeCtx()
    await seedProduct(ctx, { name: 'Crème épicée', barcode: '6001' })
    await expect(seedProduct(ctx, { name: 'Autre', barcode: '6001' })).rejects.toThrow(
      'déjà utilisé',
    )
    expect((await searchProducts(ctx.db, 'CREME')).map((p) => p.name)).toEqual(['Crème épicée'])
    expect((await findByBarcode(ctx.db, ' 6001 '))?.name).toBe('Crème épicée')
    await expect(
      saveProduct({ ...ctx, role: 'cashier' }, { name: 'X', sale_price: 1 }),
    ).rejects.toThrow(PermissionError)
    expect(await saveCategory(ctx, 'Boissons')).toBeTruthy()
  })
  it('import CSV : chaque ligne invalide est signalée', async () => {
    const ctx = await makeCtx()
    const report = await importProducts(ctx, [
      { name: 'A', sale_price: 100, barcode: '1' },
      { name: '', sale_price: 100 },
      { name: 'B', sale_price: -5 },
      { name: 'C', sale_price: 100, barcode: '1' },
    ])
    expect(report.created).toBe(1)
    expect(report.errors.map((e) => e.line)).toEqual([3, 4, 5])
  })
  it('dépenses : saisie, suppression douce', async () => {
    const ctx = await makeCtx()
    const id = await saveExpense(ctx, { label: 'Loyer', amount: 50000, expense_date: '2026-10-18' })
    await deleteExpense(ctx, id)
    expect((await ctx.db.expenses.get(id))?.deleted_at).not.toBeNull()
    await expect(
      saveExpense(
        { ...ctx, role: 'cashier' },
        { label: 'x', amount: 5, expense_date: '2026-10-18' },
      ),
    ).rejects.toThrow(PermissionError)
    await expect(
      saveExpense(ctx, { label: 'x', amount: 0, expense_date: '2026-10-18' }),
    ).rejects.toThrow(ValidationError)
  })
  it('paniers en attente', async () => {
    const ctx = await makeCtx()
    const id = await holdCart(ctx.db, {
      label: 'Client 1',
      lines: [line('p')],
      customer_id: null,
      discount: 0,
    })
    expect(await listHeldCarts(ctx.db)).toHaveLength(1)
    await removeHeldCart(ctx.db, id)
    expect(await listHeldCarts(ctx.db)).toHaveLength(0)
  })
  it('sauvegarde complète contenant l’outbox', async () => {
    const ctx = await makeCtx()
    await seedProduct(ctx)
    const backup = await exportBackup(ctx.db)
    expect(backup.tables.products).toHaveLength(1)
    expect(backup.outbox.length).toBeGreaterThan(0)
  })
})

describe('migration Dexie v1 → v2', () => {
  it('conserve toutes les données et ajoute les nouvelles tables', async () => {
    const name = `migr-${Math.random()}`
    const v1 = new Dexie(name)
    v1.version(1).stores(V1_STORES)
    await v1.table('meta').put({ key: 'device_id', value: 'abcdef123456' })
    await v1.table('outbox').add({
      table: 'sales',
      op: 'insert',
      record_id: 'r1',
      payload: { a: 1 },
      created_at: 'x',
      attempts: 0,
      last_error: null,
      next_retry_at: 0,
    })
    await v1.table('stock_cache').put({ product_id: 'p', qty: 7 })
    v1.close()
    const v2 = new JagoDb(name)
    await v2.open()
    expect((await v2.meta.get('device_id'))?.value).toBe('abcdef123456')
    expect(await v2.outbox.count()).toBe(1)
    expect((await v2.stock_cache.get('p'))?.qty).toBe(7)
    expect((await v2.meta.get('app_data_version'))?.value).toBe(2)
    expect(await v2.held_carts.count()).toBe(0)
    expect(v2.verno).toBe(2)
  })
})
