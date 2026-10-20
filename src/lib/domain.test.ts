import { describe, expect, it } from 'vitest'
import type { CartLine } from '@/db/dexie'
import type { Expense, Product, Sale, SaleItem, SalePayment, StockMovement } from '@/db/schemas'
import { parseSettings } from '@/db/settings'
import { analyzeControl, totalFindings } from './control'
import { periodRange } from './dates'
import { approvalReasons } from './override'
import {
  receiptLines,
  receiptText,
  whatsappUrl,
  RECEIPT_MENTION,
  type ReceiptData,
} from './receipt'
import { buildReport, lowStock, openDebts, stockValue } from './reports'

const base = {
  shop_id: 's',
  updated_at: '',
  server_updated_at: null,
  deleted_at: null,
  created_by: 'u1',
}
const sale = (id: string, over: Partial<Sale> = {}): Sale => ({
  ...base,
  id,
  created_at: '2026-10-18T10:00:00.000Z',
  receipt_no: id,
  customer_id: null,
  subtotal: 3000,
  discount: 0,
  total: 3000,
  paid_total: 3000,
  credit_amount: 0,
  status: 'completed',
  voided_at: null,
  voided_by: null,
  void_reason: null,
  note: null,
  override: false,
  device_id: 'd',
  fiscal: null,
  ...over,
})
const item = (sid: string, over: Partial<SaleItem> = {}): SaleItem => ({
  ...base,
  id: `i-${sid}-${Math.random()}`,
  created_at: '2026-10-18T10:00:00.000Z',
  sale_id: sid,
  product_id: 'p1',
  name_snapshot: 'Riz',
  qty: 3,
  unit_price: 1000,
  list_price_snapshot: 1000,
  cost_snapshot: 600,
  line_discount: 0,
  line_total: 3000,
  ...over,
})
const range = periodRange('today', new Date('2026-10-18T14:00:00Z'))

describe('rapports', () => {
  it('chiffre d’affaires, bénéfice (remise comprise), ventes annulées exclues', () => {
    const sales = [
      sale('a'),
      sale('b', { discount: 500, total: 2500, subtotal: 3000 }),
      sale('c', { status: 'voided' }),
      sale('old', { created_at: '2026-10-10T10:00:00.000Z' }),
    ]
    const items = [item('a'), item('b'), item('c'), item('old')]
    const payments: SalePayment[] = [
      { ...base, id: 'p1', created_at: '', sale_id: 'a', method: 'cash', amount: 3000 },
      { ...base, id: 'p2', created_at: '', sale_id: 'b', method: 'wave', amount: 2500 },
      { ...base, id: 'p3', created_at: '', sale_id: 'c', method: 'cash', amount: 3000 },
    ]
    const expenses: Expense[] = [
      {
        ...base,
        id: 'e1',
        created_at: '',
        label: 'Loyer',
        category: null,
        amount: 1000,
        expense_date: '2026-10-18',
      },
      {
        ...base,
        id: 'e2',
        created_at: '',
        label: 'Vieux',
        category: null,
        amount: 9999,
        expense_date: '2026-10-01',
      },
    ]
    const r = buildReport({ sales, items, payments, expenses, range })
    expect(r).toMatchObject({
      revenue: 5500,
      salesCount: 2,
      grossProfit: 1200 + 700,
      expensesTotal: 1000,
      netProfit: 900,
      profitComplete: true,
    })
    expect(r.byMethod).toEqual([
      { method: 'cash', amount: 3000 },
      { method: 'wave', amount: 2500 },
    ])
    expect(r.topProducts[0]).toMatchObject({ product_id: 'p1', qty: 6, revenue: 6000 })
    expect(r.byDay).toEqual([{ day: '2026-10-18', total: 5500 }])
  })
  it('signale un bénéfice incomplet quand le prix d’achat est inconnu (caissier)', () => {
    const r = buildReport({
      sales: [sale('a')],
      items: [item('a', { cost_snapshot: null })],
      payments: [],
      expenses: [],
      range,
    })
    expect(r.profitComplete).toBe(false)
  })
  it('dettes, valeur et alertes de stock', () => {
    expect(openDebts([{ balance: 1000 }, { balance: -500 }, { balance: 250 }])).toBe(1250)
    const p = (id: string, over: Partial<Product> = {}): Product => ({
      ...base,
      id,
      created_at: '',
      name: id,
      kind: 'product',
      barcode: null,
      sku: null,
      category_id: null,
      unit: 'pièce',
      sale_price: 1,
      wholesale_price: null,
      track_stock: true,
      low_stock_threshold: 2,
      is_active: true,
      ...over,
    })
    const stock = new Map([
      ['a', 10],
      ['b', 1],
      ['c', -3],
    ])
    const costs = new Map([
      ['a', { ...base, id: 'a', created_at: '', cost_price: 100 }],
      ['c', { ...base, id: 'c', created_at: '', cost_price: 50 }],
    ])
    expect(stockValue([p('a'), p('b'), p('c')], stock, costs)).toBe(1000)
    expect(lowStock([p('a'), p('b'), p('c')], stock).map((x) => x.id)).toEqual(['b', 'c'])
  })
})

describe('contrôle', () => {
  it('repère prix cassés, remises, annulations, ajustements, stock négatif, heures inhabituelles', () => {
    const mv = (type: StockMovement['type']): StockMovement => ({
      ...base,
      id: type,
      created_at: '2026-10-18T10:00:00.000Z',
      product_id: 'p1',
      type,
      qty: -1,
      unit_cost: null,
      supplier_id: null,
      sale_id: null,
      note: 'x',
      device_id: null,
    })
    const product: Product = {
      ...base,
      id: 'p1',
      created_at: '',
      name: 'Riz',
      kind: 'product',
      barcode: null,
      sku: null,
      category_id: null,
      unit: 'pièce',
      sale_price: 1000,
      wholesale_price: null,
      track_stock: true,
      low_stock_threshold: 0,
      is_active: true,
    }
    const sales = [
      sale('a'),
      sale('night', { created_at: '2026-10-18T02:00:00.000Z' }),
      sale('disc', { discount: 1000, total: 2000 }),
      sale('v', { status: 'voided', voided_by: 'u9' }),
      sale('ov', { override: true }),
    ]
    const items = [item('a', { unit_price: 800 }), item('disc')]
    const r = analyzeControl({
      sales,
      items,
      movements: [mv('adjustment'), mv('loss'), mv('sale')],
      products: [product],
      stock: new Map([['p1', -2]]),
      discountThresholdPct: 10,
    })
    expect(r.belowListPrice).toHaveLength(1)
    expect(r.belowListPrice[0]?.gap).toBe(600)
    expect(r.highDiscounts.map((h) => h.sale.id)).toEqual(['disc'])
    expect(r.voids).toEqual([{ user: 'u9', count: 1, total: 3000 }])
    expect(r.adjustments).toHaveLength(2)
    expect(r.negativeStock[0]?.qty).toBe(-2)
    expect(r.oddHours.map((s) => s.id)).toEqual(['night'])
    expect(r.overrides.map((s) => s.id)).toEqual(['ov'])
    expect(totalFindings(r)).toBeGreaterThan(5)
  })
})

describe('dépassements de remise / prix du caissier', () => {
  const line = (over: Partial<CartLine> = {}): CartLine => ({
    product_id: 'p',
    name: 'Riz',
    qty: 1,
    unit_price: 1000,
    list_price: 1000,
    line_discount: 0,
    track_stock: true,
    ...over,
  })
  const settings = parseSettings({ discount_cap_pct: 10, cashier_can_edit_price: false })
  it('le gérant n’est jamais bloqué', () => {
    expect(approvalReasons('manager', settings, [line({ unit_price: 1 })], 500)).toEqual([])
  })
  it('le caissier : prix modifié et remise au-delà du plafond', () => {
    expect(approvalReasons('cashier', settings, [line()], 0)).toEqual([])
    expect(approvalReasons('cashier', settings, [line()], 100)).toEqual([])
    expect(approvalReasons('cashier', settings, [line()], 200)).toEqual([
      'Remise supérieure à 10 %',
    ])
    expect(approvalReasons('cashier', settings, [line({ unit_price: 900 })], 0)).toEqual([
      'Prix modifié',
    ])
    expect(
      approvalReasons('cashier', { ...settings, cashier_can_discount: false }, [line()], 50),
    ).toEqual(['Remise non autorisée au caissier'])
  })
})

describe('reçu et WhatsApp', () => {
  const data: ReceiptData = {
    shopName: 'Chez Sali',
    address: 'Marché central',
    phone: '70123456',
    footer: 'Merci !',
    paper: 58,
    receiptNo: '261018-ab12-1',
    date: '2026-10-18T10:30:00Z',
    customerName: 'Awa',
    lines: [{ name: 'Riz 25kg', qty: 2, unit_price: 12500, line_discount: 0, line_total: 25000 }],
    subtotal: 25000,
    discount: 1000,
    total: 24000,
    payments: [{ method: 'orange_money', amount: 20000 }],
    paid_total: 20000,
    credit_amount: 4000,
    voided: false,
  }
  it('met en page selon la largeur du papier et porte la mention légale', () => {
    for (const paper of [58, 80] as const) {
      const lines = receiptLines({ ...data, paper })
        .join('\n')
        .split('\n')
      expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(paper === 58 ? 32 : 48)
    }
    const text = receiptLines(data).join('\n')
    expect(text.replace(/\s+/g, ' ')).toContain(RECEIPT_MENTION)
    expect(text).toContain('RESTE À PAYER')
    expect(text).not.toMatch(/facture n/i)
  })
  it('texte WhatsApp compact et lien sûr', () => {
    expect(receiptText(data)).toContain('Reste à payer')
    const url = whatsappUrl('70 12 34 56', 'Total : 5 000 FCFA & merci')
    expect(url?.startsWith('https://wa.me/22670123456?text=')).toBe(true)
    expect(url).not.toContain(' ')
    expect(url).toContain('%26')
    expect(whatsappUrl('abc', 'x')).toBeNull()
    expect(whatsappUrl('70123456", "x', 'x')).toBeNull()
  })
})
