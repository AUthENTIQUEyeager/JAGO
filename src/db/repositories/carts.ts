import { newId } from '@/lib/id'
import type { CartLine, HeldCart, JagoDb } from '../dexie'

/** Paniers mis en attente (locaux à l'appareil, non synchronisés). */
export async function holdCart(
  db: JagoDb,
  cart: { label: string; lines: CartLine[]; customer_id: string | null; discount: number },
  id?: string,
): Promise<string> {
  const now = new Date().toISOString()
  const existing = id ? await db.held_carts.get(id) : undefined
  const cartId = existing?.id ?? newId()
  await db.held_carts.put({
    ...cart,
    id: cartId,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  })
  return cartId
}
export const listHeldCarts = (db: JagoDb): Promise<HeldCart[]> =>
  db.held_carts.orderBy('updated_at').reverse().toArray()
export const removeHeldCart = (db: JagoDb, id: string): Promise<void> => db.held_carts.delete(id)
