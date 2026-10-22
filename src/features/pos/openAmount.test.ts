import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import type { Ctx } from '@/db/ctx'
import { JagoDb } from '@/db/dexie'
import { ensureDeviceIdentity } from '@/db/meta'
import { createSale, lineCost } from '@/db/repositories/sales'
import { saveProduct } from '@/db/repositories/products'
import type { Product } from '@/db/schemas'
import { approvalReasons } from '@/lib/override'
import { parseSettings } from '@/db/settings'
import { cartReducer, EMPTY_CART, isOpenAmount } from './cart'
import { ACTIVITIES, toProductInput } from '@/config/activities'

const SHOP = '10000000-0000-4000-8000-00000000000a'
const USER = '00000000-0000-4000-8000-0000000000a1'

async function ctxFor(role: Ctx['role'] = 'owner'): Promise<Ctx> {
  const db = new JagoDb(`open-${Math.random()}`)
  const { deviceId, deviceShort } = await ensureDeviceIdentity(db)
  return { db, shopId: SHOP, userId: USER, role, deviceId, deviceShort }
}

const product = (over: Partial<Product> = {}): Product =>
  ({
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Unités Orange',
    kind: 'service',
    sale_price: 0,
    track_stock: false,
    ...over,
  }) as Product

describe('service à montant libre', () => {
  it('est reconnu : service avec un prix de vente à 0', () => {
    expect(isOpenAmount(product())).toBe(true)
    expect(isOpenAmount(product({ sale_price: 25 }))).toBe(false)
    expect(isOpenAmount(product({ kind: 'product' }))).toBe(false)
  })

  it('ajoute une ligne avec le montant saisi, sans stock', () => {
    const state = cartReducer(EMPTY_CART, { type: 'addOpen', product: product(), amount: 1000 })
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]).toMatchObject({
      unit_price: 1000,
      list_price: 1000,
      qty: 1,
      open: true,
      track_stock: false,
    })
  })

  it('additionne deux montants du même service sur une seule ligne', () => {
    let state = cartReducer(EMPTY_CART, { type: 'addOpen', product: product(), amount: 500 })
    state = cartReducer(state, { type: 'addOpen', product: product(), amount: 1500 })
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]).toMatchObject({ unit_price: 2000, list_price: 2000 })
  })

  it('ignore un montant nul', () => {
    expect(cartReducer(EMPTY_CART, { type: 'addOpen', product: product(), amount: 0 })).toBe(
      EMPTY_CART,
    )
  })

  it('modifier le montant garde prix de référence = prix (jamais « prix modifié »)', () => {
    const base = cartReducer(EMPTY_CART, { type: 'addOpen', product: product(), amount: 500 })
    const state = cartReducer(base, { type: 'price', id: product().id, price: 700 })
    expect(state.lines[0]).toMatchObject({ unit_price: 700, list_price: 700 })
    const settings = parseSettings({ cashier_can_edit_price: false })
    expect(approvalReasons('cashier', settings, state.lines, 0)).toEqual([])
  })
})

describe('coût d’un montant libre', () => {
  it('est un pourcentage du montant vendu', () => {
    expect(lineCost({ open: true, unit_price: 1000 }, 97)).toBe(970)
    expect(lineCost({ open: true, unit_price: 1000 }, 0)).toBe(0)
    expect(lineCost({ open: true, unit_price: 1000 }, 250)).toBe(1000) // plafonné à 100 %
    expect(lineCost({ open: false, unit_price: 1000 }, 600)).toBe(600)
    expect(lineCost({ open: true, unit_price: 1000 }, undefined)).toBeNull()
  })

  it('une vente d’unités mémorise le coût et donc le bénéfice', async () => {
    const ctx = await ctxFor()
    const id = await saveProduct(ctx, {
      name: 'Unités Orange',
      kind: 'service',
      sale_price: 0,
      cost_price: 97,
      track_stock: false,
    })
    const cart = cartReducer(EMPTY_CART, {
      type: 'addOpen',
      product: { ...product(), id },
      amount: 2000,
    })
    const { saleId } = await createSale(ctx, {
      lines: cart.lines,
      discount: 0,
      payments: [{ method: 'cash', amount: 2000 }],
      customer_id: null,
    })
    const items = await ctx.db.sale_items.where('sale_id').equals(saleId).toArray()
    expect(items[0]).toMatchObject({ unit_price: 2000, line_total: 2000, cost_snapshot: 1940 })
    expect(await ctx.db.stock_movements.count()).toBe(0)
  })
})

describe('modèles d’activité', () => {
  it('produisent des produits valides et enregistrables', async () => {
    const ctx = await ctxFor()
    for (const activity of ACTIVITIES) {
      const categoryId = '30000000-0000-4000-8000-000000000001'
      for (const item of activity.items) {
        const input = toProductInput(item, categoryId)
        expect(input.kind).toBe('service')
        expect(input.sale_price === 0).toBe(item.open === true)
        await expect(saveProduct(ctx, input)).resolves.toBeTruthy()
      }
    }
  })
})
