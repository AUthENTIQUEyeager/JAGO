import type { JagoDb } from './dexie'

/**
 * Stock = somme des mouvements du produit (jamais une valeur modifiable).
 * Recalculé depuis l'index product_id : pas de double comptage possible, même si un mouvement
 * arrive à la fois en local et par pull. À appeler dans la transaction qui a écrit les mouvements.
 */
export async function recomputeStock(db: JagoDb, productIds: Iterable<string>): Promise<void> {
  for (const productId of new Set(productIds)) {
    const movements = await db.stock_movements.where('product_id').equals(productId).toArray()
    const milli = movements.reduce((sum, m) => sum + Math.round(m.qty * 1000), 0)
    await db.stock_cache.put({ product_id: productId, qty: milli / 1000 })
  }
}

/** Solde client = somme du carnet (positif = le client doit de l'argent). */
export async function recomputeBalances(db: JagoDb, customerIds: Iterable<string>): Promise<void> {
  for (const customerId of new Set(customerIds)) {
    const entries = await db.customer_ledger.where('customer_id').equals(customerId).toArray()
    await db.balance_cache.put({
      customer_id: customerId,
      balance: entries.reduce((s, e) => s + e.amount, 0),
    })
  }
}

export async function recomputeAllDerived(db: JagoDb): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await recomputeStock(
      db,
      (await db.stock_movements.orderBy('product_id').uniqueKeys()) as string[],
    )
    await recomputeBalances(
      db,
      (await db.customer_ledger.orderBy('customer_id').uniqueKeys()) as string[],
    )
  })
}
