import type { JagoDb } from '@/db/dexie'
import type { ShopSettings } from '@/db/settings'
import type { ReceiptData } from '@/lib/receipt'

/** Rassemble les données d'un reçu depuis Dexie (fonctionne hors ligne). */
export async function buildReceiptData(
  db: JagoDb,
  saleId: string,
  shopName: string,
  settings: ShopSettings,
): Promise<ReceiptData | null> {
  const sale = await db.sales.get(saleId)
  if (!sale) return null
  const [items, payments, customer] = await Promise.all([
    db.sale_items.where('sale_id').equals(saleId).toArray(),
    db.sale_payments.where('sale_id').equals(saleId).toArray(),
    sale.customer_id ? db.customers.get(sale.customer_id) : Promise.resolve(undefined),
  ])
  return {
    shopName,
    address: settings.address,
    phone: settings.phone,
    footer: settings.footer,
    paper: settings.paper,
    receiptNo: sale.receipt_no,
    date: sale.created_at,
    customerName: customer?.name ?? null,
    lines: items.map((i) => ({
      name: i.name_snapshot,
      qty: i.qty,
      unit_price: i.unit_price,
      line_discount: i.line_discount,
      line_total: i.line_total,
    })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
    paid_total: sale.paid_total,
    credit_amount: sale.credit_amount,
    voided: sale.status === 'voided',
  }
}
