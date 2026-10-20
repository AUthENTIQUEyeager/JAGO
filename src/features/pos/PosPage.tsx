import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Minus, Pause, Plus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { setSaleInProgress } from '@/pwa/activity'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { PageHeader } from '@/components/PageHeader'
import { useSession } from '@/auth/context'
import { isManager } from '@/db/ctx'
import type { SaleResult } from '@/db/repositories/sales'
import { findByBarcode, searchProducts } from '@/db/repositories/products'
import { holdCart, listHeldCarts, removeHeldCart } from '@/db/repositories/carts'
import { useAction } from '@/hooks/useAction'
import { formatMoney, formatQty, parseMoney, parseQty } from '@/lib/money'
import { computeSale } from '@/lib/sale'
import { barcodeScanSupported } from './barcode'
import { BarcodeScanner } from './BarcodeScanner'
import { Checkout } from './Checkout'
import { buildReceiptData } from './receiptData'
import { ReceiptView } from './ReceiptView'
import { cartReducer, EMPTY_CART } from './cart'

export default function PosPage() {
  const { db, ctx, settings, shop } = useSession()
  const [cart, dispatch] = useReducer(cartReducer, EMPTY_CART)
  const [q, setQ] = useState('')
  const [scanning, setScanning] = useState(false)
  const [paying, setPaying] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [done, setDone] = useState<SaleResult | null>(null)
  const { run } = useAction()
  const canEditPrice = isManager(ctx) || settings.cashier_can_edit_price
  const products = useLiveQuery(
    () => searchProducts(db, q, { activeOnly: true, limit: 12 }),
    [db, q],
  )
  const stock = useLiveQuery(
    async () => new Map((await db.stock_cache.toArray()).map((s) => [s.product_id, s.qty])),
    [db],
  )
  const held = useLiveQuery(() => listHeldCarts(db), [db])
  const calc = computeSale(cart.lines, cart.discount, [])
  useEffect(() => {
    setSaleInProgress(cart.lines.length > 0 || paying)
    return () => {
      setSaleInProgress(false)
    }
  }, [cart.lines.length, paying])

  const addByCode = useCallback(
    async (code: string) => {
      const product = await findByBarcode(db, code)
      if (product) {
        dispatch({ type: 'add', product })
        setQ('')
        setScanning(false)
      }
    },
    [db],
  )

  if (done)
    return (
      <SaleDone
        result={done}
        onNew={() => {
          setDone(null)
          dispatch({ type: 'clear' })
        }}
      />
    )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Caisse"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setHeldOpen(true)
            }}
          >
            En attente ({held?.length ?? 0})
          </Button>
        }
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-neutral-600"
            aria-hidden="true"
          />
          <input
            aria-label="Rechercher un produit ou scanner un code"
            placeholder="Nom ou code-barres…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                const first = products?.[0]
                void (async () => {
                  const exact = await findByBarcode(db, q)
                  if (exact) {
                    dispatch({ type: 'add', product: exact })
                    setQ('')
                  } else if (first && products?.length === 1) {
                    dispatch({ type: 'add', product: first })
                    setQ('')
                  }
                })()
              }
            }}
            className="min-h-12 w-full rounded-xl border border-neutral-400 bg-white pl-11 pr-3 text-base"
          />
        </div>
        <Button
          variant="secondary"
          aria-label="Scanner avec la caméra"
          onClick={() => {
            setScanning(true)
          }}
          disabled={!barcodeScanSupported()}
          title={barcodeScanSupported() ? undefined : 'Scan caméra indisponible sur cet appareil'}
        >
          <Camera className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {(products ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              dispatch({ type: 'add', product: p })
              setQ('')
            }}
            className="flex min-h-20 flex-col justify-between rounded-xl border border-neutral-300 bg-white p-3 text-left active:bg-brand-50"
          >
            <span className="line-clamp-2 text-base font-semibold text-neutral-900">{p.name}</span>
            <span className="text-sm font-bold text-brand-800">{formatMoney(p.sale_price)}</span>
          </button>
        ))}
      </div>
      {products && products.length === 0 ? (
        <p className="text-base text-neutral-700">Aucun produit trouvé.</p>
      ) : null}

      <section aria-label="Panier" className="space-y-2">
        {cart.lines.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-400 p-6 text-center text-base text-neutral-700">
            Le panier est vide. Touchez un produit pour l’ajouter.
          </p>
        ) : null}
        {cart.lines.map((l) => {
          const available = stock?.get(l.product_id) ?? 0
          return (
            <div
              key={l.product_id}
              className="space-y-2 rounded-xl border border-neutral-300 bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-semibold">{l.name}</p>
                <button
                  type="button"
                  aria-label={`Retirer ${l.name}`}
                  onClick={() => {
                    dispatch({ type: 'remove', id: l.product_id })
                  }}
                  className="flex h-11 w-11 items-center justify-center text-red-700"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  aria-label="Diminuer"
                  onClick={() => {
                    dispatch({
                      type: 'qty',
                      id: l.product_id,
                      qty: Math.round((l.qty - 1) * 1000) / 1000,
                    })
                  }}
                >
                  <Minus className="h-5 w-5" aria-hidden="true" />
                </Button>
                <input
                  aria-label={`Quantité de ${l.name}`}
                  inputMode="decimal"
                  defaultValue={formatQty(l.qty).replace(/\s/g, '')}
                  key={`${l.product_id}-${l.qty}`}
                  onBlur={(e) => {
                    const v = parseQty(e.target.value)
                    if (v) dispatch({ type: 'qty', id: l.product_id, qty: v })
                  }}
                  className="min-h-11 w-20 rounded-xl border border-neutral-400 text-center text-base"
                />
                <Button
                  variant="secondary"
                  aria-label="Augmenter"
                  onClick={() => {
                    dispatch({
                      type: 'qty',
                      id: l.product_id,
                      qty: Math.round((l.qty + 1) * 1000) / 1000,
                    })
                  }}
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </Button>
                <span className="ml-auto text-lg font-bold">
                  {formatMoney(
                    calc.lines.find((x) => x.product_id === l.product_id)?.line_total ?? 0,
                  )}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {canEditPrice ? (
                  <label className="flex items-center gap-1">
                    Prix{' '}
                    <input
                      aria-label={`Prix de ${l.name}`}
                      inputMode="numeric"
                      defaultValue={l.unit_price}
                      key={`p-${l.product_id}-${l.unit_price}`}
                      onBlur={(e) => {
                        const v = parseMoney(e.target.value)
                        if (v !== null) dispatch({ type: 'price', id: l.product_id, price: v })
                      }}
                      className="min-h-11 w-24 rounded-lg border border-neutral-400 px-2 text-right text-base"
                    />
                  </label>
                ) : (
                  <span>{formatMoney(l.unit_price)} l’unité</span>
                )}
                <label className="flex items-center gap-1">
                  Remise{' '}
                  <input
                    aria-label={`Remise sur ${l.name}`}
                    inputMode="numeric"
                    defaultValue={l.line_discount || ''}
                    key={`d-${l.product_id}-${l.line_discount}`}
                    onBlur={(e) => {
                      dispatch({
                        type: 'lineDiscount',
                        id: l.product_id,
                        amount: parseMoney(e.target.value) ?? 0,
                      })
                    }}
                    className="min-h-11 w-24 rounded-lg border border-neutral-400 px-2 text-right text-base"
                  />
                </label>
                {l.track_stock && l.qty > available ? (
                  <Badge tone="warning">Stock insuffisant ({formatQty(available)})</Badge>
                ) : null}
              </div>
            </div>
          )
        })}
      </section>

      <div className="sticky bottom-20 z-20 space-y-2 rounded-2xl border border-neutral-300 bg-white p-3 shadow-lg md:bottom-4">
        <div className="flex items-center justify-between text-xl font-bold">
          <span>Total</span>
          <span>{formatMoney(calc.total)}</span>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={cart.lines.length === 0}
            onClick={() =>
              void run(async () => {
                await holdCart(db, {
                  label: `Panier ${formatMoney(calc.total)}`,
                  lines: cart.lines,
                  customer_id: cart.customer_id,
                  discount: cart.discount,
                })
                dispatch({ type: 'clear' })
              }, 'Panier mis en attente.')
            }
          >
            <Pause className="h-5 w-5" aria-hidden="true" />
            Attente
          </Button>
          <Button
            size="lg"
            fullWidth
            disabled={cart.lines.length === 0}
            onClick={() => {
              setPaying(true)
            }}
          >
            Payer
          </Button>
        </div>
      </div>

      {scanning ? (
        <BarcodeScanner
          onDetect={(c) => void addByCode(c)}
          onClose={() => {
            setScanning(false)
          }}
        />
      ) : null}
      {paying ? (
        <Checkout
          cart={cart}
          onCustomer={(id) => {
            dispatch({ type: 'customer', id })
          }}
          onDiscount={(amount) => {
            dispatch({ type: 'discount', amount })
          }}
          onClose={() => {
            setPaying(false)
          }}
          onDone={(r) => {
            setPaying(false)
            setDone(r)
          }}
        />
      ) : null}
      {heldOpen ? (
        <Modal
          open
          title="Paniers en attente"
          onClose={() => {
            setHeldOpen(false)
          }}
          footer={
            <Button
              variant="secondary"
              onClick={() => {
                setHeldOpen(false)
              }}
            >
              Fermer
            </Button>
          }
        >
          {(held ?? []).length === 0 ? (
            <p className="text-base">Aucun panier en attente.</p>
          ) : (
            <ul className="space-y-2">
              {(held ?? []).map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-neutral-300 p-3"
                >
                  <span className="text-base">
                    {h.label} · {h.lines.length} article(s)
                  </span>
                  <span className="flex gap-1">
                    <Button
                      onClick={() => {
                        dispatch({
                          type: 'load',
                          state: {
                            lines: h.lines,
                            customer_id: h.customer_id,
                            discount: h.discount,
                          },
                        })
                        void removeHeldCart(db, h.id)
                        setHeldOpen(false)
                      }}
                    >
                      Reprendre
                    </Button>
                    <Button
                      variant="ghost"
                      aria-label="Supprimer ce panier"
                      onClick={() => void removeHeldCart(db, h.id)}
                    >
                      <Trash2 className="h-5 w-5" aria-hidden="true" />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
      <p className="sr-only">{shop.name}</p>
    </div>
  )
}

function SaleDone({ result, onNew }: { result: SaleResult; onNew: () => void }) {
  const { db, shop, settings } = useSession()
  const data = useLiveQuery(
    () => buildReceiptData(db, result.saleId, shop.name, settings),
    [db, result.saleId],
  )
  const phone = useLiveQuery(async () => {
    const s = await db.sales.get(result.saleId)
    return s?.customer_id ? ((await db.customers.get(s.customer_id))?.phone ?? null) : null
  }, [db, result.saleId])
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-brand-700 p-5 text-center text-white">
        <p className="text-xl font-bold">Vente enregistrée ✔</p>
        <p className="text-base">Reçu {result.receiptNo}</p>
      </div>
      {data ? <ReceiptView data={data} customerPhone={phone} /> : null}
      <Button size="lg" fullWidth onClick={onNew}>
        Nouvelle vente
      </Button>
    </div>
  )
}
