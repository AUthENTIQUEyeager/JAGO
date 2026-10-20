import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { PageHeader, Stat } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Select } from '@/components/Select'
import { TabPanel, Tabs } from '@/components/Tabs'
import { useSession } from '@/auth/context'
import { isManager } from '@/db/ctx'
import type { Product } from '@/db/schemas'
import { searchProducts } from '@/db/repositories/products'
import { addAdjustment, addPurchase, applyInventory } from '@/db/repositories/stock'
import { fr } from '@/i18n/fr'
import { useAction } from '@/hooks/useAction'
import { formatDateTime } from '@/lib/dates'
import { formatMoney, formatQty, parseMoney } from '@/lib/money'
import { stockValue } from '@/lib/reports'

type Kind = 'purchase' | 'adjustment' | 'loss'
const TITLES: Record<Kind, string> = {
  purchase: 'Entrée de stock',
  adjustment: 'Ajustement',
  loss: 'Perte',
}

export default function StockPage() {
  const { db, ctx } = useSession()
  const manager = isManager(ctx)
  const [tab, setTab] = useState('stock')
  const [q, setQ] = useState('')
  const [move, setMove] = useState<{ product: Product; kind: Kind } | null>(null)
  const [history, setHistory] = useState<Product | null>(null)
  const products = useLiveQuery(
    () => searchProducts(db, q, { limit: 200 }).then((l) => l.filter((p) => p.track_stock)),
    [db, q],
  )
  const all = useLiveQuery(() => db.products.filter((p) => !p.deleted_at).toArray(), [db])
  const stock = useLiveQuery(
    async () => new Map((await db.stock_cache.toArray()).map((s) => [s.product_id, s.qty])),
    [db],
  )
  const costs = useLiveQuery(
    async () => new Map((await db.product_costs.toArray()).map((c) => [c.id, c])),
    [db],
  )
  if (!products || !all || !stock || !costs) return <PageSkeleton />
  const low = products.filter((p) => p.is_active && (stock.get(p.id) ?? 0) <= p.low_stock_threshold)
  const tabs = manager
    ? [
        { id: 'stock', label: 'Stock' },
        { id: 'inventory', label: 'Inventaire' },
      ]
    : [{ id: 'stock', label: 'Stock' }]

  return (
    <div className="space-y-4">
      <PageHeader title="Stock" />
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Produits en stock bas"
          value={String(low.length)}
          tone={low.length ? 'bad' : 'default'}
        />
        {manager ? (
          <Stat
            label="Valeur du stock (prix d’achat)"
            value={formatMoney(stockValue(all, stock, costs))}
          />
        ) : null}
      </div>
      <Tabs
        idPrefix="stock"
        ariaLabel="Sections du stock"
        tabs={tabs}
        value={tab}
        onChange={setTab}
      />
      <TabPanel idPrefix="stock" id="stock" active={tab === 'stock'}>
        <input
          aria-label="Rechercher un produit"
          placeholder="Rechercher…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
          }}
          className="mb-3 min-h-12 w-full rounded-xl border border-neutral-400 bg-white px-3 text-base"
        />
        {products.length === 0 ? (
          <EmptyState title="Aucun produit suivi en stock" />
        ) : (
          <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
            {products.map((p) => {
              const qty = stock.get(p.id) ?? 0
              return (
                <li key={p.id} className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-base font-semibold">{p.name}</p>
                    <p className="shrink-0 text-lg font-bold">
                      {formatQty(qty)}{' '}
                      <span className="text-sm font-medium text-neutral-700">{p.unit}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {qty < 0 ? (
                      <Badge tone="danger">Stock négatif</Badge>
                    ) : qty <= p.low_stock_threshold ? (
                      <Badge tone="warning">Stock bas</Badge>
                    ) : null}
                    {manager
                      ? (['purchase', 'adjustment', 'loss'] as const).map((k) => (
                          <Button
                            key={k}
                            variant="secondary"
                            onClick={() => {
                              setMove({ product: p, kind: k })
                            }}
                          >
                            {k === 'purchase' ? 'Entrée' : k === 'adjustment' ? 'Ajuster' : 'Perte'}
                          </Button>
                        ))
                      : null}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setHistory(p)
                      }}
                    >
                      Historique
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </TabPanel>
      {manager ? (
        <TabPanel idPrefix="stock" id="inventory" active={tab === 'inventory'}>
          <Inventory products={products} stock={stock} />
        </TabPanel>
      ) : null}
      {move ? (
        <MovementModal
          product={move.product}
          kind={move.kind}
          onClose={() => {
            setMove(null)
          }}
        />
      ) : null}
      {history ? (
        <HistoryModal
          product={history}
          onClose={() => {
            setHistory(null)
          }}
        />
      ) : null}
    </div>
  )
}

function MovementModal({
  product,
  kind,
  onClose,
}: {
  product: Product
  kind: Kind
  onClose: () => void
}) {
  const { db, ctx } = useSession()
  const suppliers = useLiveQuery(
    () => db.suppliers.filter((s) => !s.deleted_at).sortBy('name'),
    [db],
  )
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState('')
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const { run, busy } = useAction()
  async function submit() {
    const n = Number(qty.replace(',', '.'))
    const ok = await run(async () => {
      if (kind === 'purchase')
        await addPurchase(ctx, {
          product_id: product.id,
          qty: n,
          unit_cost: parseMoney(cost) ?? -1,
          supplier_id: supplier || null,
          note,
        })
      else await addAdjustment(ctx, { product_id: product.id, qty: n, kind, note })
    }, 'Stock mis à jour.')
    if (ok) onClose()
  }
  return (
    <Modal
      open
      title={`${TITLES[kind]} — ${product.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label={kind === 'adjustment' ? 'Quantité (+ ajoute, − retire)' : 'Quantité'}
          inputMode="decimal"
          value={qty}
          onChange={(e) => {
            setQty(e.target.value)
          }}
        />
        {kind === 'purchase' ? (
          <>
            <Input
              label="Prix d’achat unitaire (FCFA)"
              inputMode="numeric"
              value={cost}
              onChange={(e) => {
                setCost(e.target.value)
              }}
            />
            <Select
              label="Fournisseur"
              value={supplier}
              onChange={setSupplier}
              options={[
                { value: '', label: 'Non précisé' },
                ...(suppliers ?? []).map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </>
        ) : null}
        <Input
          label={kind === 'purchase' ? 'Note (facultatif)' : 'Motif (obligatoire)'}
          value={note}
          onChange={(e) => {
            setNote(e.target.value)
          }}
        />
      </div>
    </Modal>
  )
}

function HistoryModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { db } = useSession()
  const rows = useLiveQuery(
    async () =>
      (await db.stock_movements.where('product_id').equals(product.id).toArray())
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 100),
    [db, product.id],
  )
  return (
    <Modal
      open
      title={`Historique — ${product.name}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <ul className="divide-y divide-neutral-200 text-base">
        {(rows ?? []).map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 py-2">
            <div>
              <p className="font-semibold">{fr.movements[m.type]}</p>
              <p className="text-sm text-neutral-700">
                {formatDateTime(m.created_at)}
                {m.note ? ` · ${m.note}` : ''}
              </p>
            </div>
            <p className={m.qty < 0 ? 'font-bold text-red-800' : 'font-bold text-brand-800'}>
              {m.qty > 0 ? '+' : ''}
              {formatQty(m.qty)}
            </p>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

function Inventory({ products, stock }: { products: Product[]; stock: Map<string, number> }) {
  const { ctx } = useSession()
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState(false)
  const { run, busy } = useAction()
  const entries = products.flatMap((p) => {
    const raw = counts[p.id]
    return raw !== undefined && raw !== ''
      ? [{ product_id: p.id, counted: Number(raw.replace(',', '.')) }]
      : []
  })
  const gaps = entries.filter((e) => e.counted !== (stock.get(e.product_id) ?? 0)).length
  return (
    <div className="space-y-3">
      <p className="text-base text-neutral-800">
        Saisissez les quantités comptées. Seuls les écarts créent des ajustements.
      </p>
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
        {products.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{p.name}</p>
              <p className="text-sm text-neutral-700">
                En stock : {formatQty(stock.get(p.id) ?? 0)} {p.unit}
              </p>
            </div>
            <input
              aria-label={`Quantité comptée pour ${p.name}`}
              inputMode="decimal"
              value={counts[p.id] ?? ''}
              onChange={(e) => {
                setCounts((c) => ({ ...c, [p.id]: e.target.value }))
              }}
              className="min-h-11 w-24 rounded-xl border border-neutral-400 px-3 text-right text-base"
            />
          </li>
        ))}
      </ul>
      <Button
        size="lg"
        fullWidth
        disabled={entries.length === 0}
        onClick={() => {
          setConfirm(true)
        }}
      >
        Valider l’inventaire ({gaps} écart{gaps > 1 ? 's' : ''})
      </Button>
      <ConfirmDialog
        open={confirm}
        loading={busy}
        title="Valider l’inventaire ?"
        message={`${gaps} écart(s) seront enregistrés comme ajustements de stock.`}
        onCancel={() => {
          setConfirm(false)
        }}
        onConfirm={() =>
          void run(async () => {
            await applyInventory(ctx, entries)
            setCounts({})
            setConfirm(false)
          }, 'Inventaire enregistré.')
        }
      />
    </div>
  )
}
