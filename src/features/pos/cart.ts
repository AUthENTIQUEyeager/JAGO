import type { CartLine } from '@/db/dexie'
import type { Product } from '@/db/schemas'
import { sumQty } from '@/lib/money'

export interface CartState {
  lines: CartLine[]
  customer_id: string | null
  discount: number
}
export const EMPTY_CART: CartState = { lines: [], customer_id: null, discount: 0 }

export type CartAction =
  | { type: 'add'; product: Product }
  | { type: 'qty'; id: string; qty: number }
  | { type: 'price'; id: string; price: number }
  | { type: 'lineDiscount'; id: string; amount: number }
  | { type: 'remove'; id: string }
  | { type: 'discount'; amount: number }
  | { type: 'customer'; id: string | null }
  | { type: 'load'; state: CartState }
  | { type: 'clear' }

const patch = (lines: CartLine[], id: string, change: Partial<CartLine>) =>
  lines.map((l) => (l.product_id === id ? { ...l, ...change } : l))

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const p = action.product
      const existing = state.lines.find(
        (l) => l.product_id === p.id && l.unit_price === l.list_price && l.line_discount === 0,
      )
      if (existing)
        return { ...state, lines: patch(state.lines, p.id, { qty: sumQty([existing.qty, 1]) }) }
      const line: CartLine = {
        product_id: p.id,
        name: p.name,
        qty: 1,
        unit_price: p.sale_price,
        list_price: p.sale_price,
        line_discount: 0,
        track_stock: p.track_stock,
      }
      return { ...state, lines: [...state.lines, line] }
    }
    case 'qty':
      return action.qty > 0
        ? { ...state, lines: patch(state.lines, action.id, { qty: action.qty }) }
        : { ...state, lines: state.lines.filter((l) => l.product_id !== action.id) }
    case 'price':
      return {
        ...state,
        lines: patch(state.lines, action.id, { unit_price: Math.max(0, Math.round(action.price)) }),
      }
    case 'lineDiscount':
      return {
        ...state,
        lines: patch(state.lines, action.id, {
          line_discount: Math.max(0, Math.round(action.amount)),
        }),
      }
    case 'remove':
      return { ...state, lines: state.lines.filter((l) => l.product_id !== action.id) }
    case 'discount':
      return { ...state, discount: Math.max(0, Math.round(action.amount)) }
    case 'customer':
      return { ...state, customer_id: action.id }
    case 'load':
      return action.state
    case 'clear':
      return EMPTY_CART
  }
}
