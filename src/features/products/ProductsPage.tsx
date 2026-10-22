import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search, Upload } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useSession } from '@/auth/context'
import { isManager } from '@/db/ctx'
import type { Product } from '@/db/schemas'
import { saveCategory, searchProducts, setProductActive } from '@/db/repositories/products'
import { useAction } from '@/hooks/useAction'
import { formatMoney, formatQty } from '@/lib/money'
import { isOpenAmount } from '../pos/cart'
import { ImportModal } from './ImportModal'
import { ProductForm } from './ProductForm'
import { TemplatesModal } from './TemplatesModal'

export default function ProductsPage() {
  const { db, ctx } = useSession()
  const manager = isManager(ctx)
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [showCats, setShowCats] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const products = useLiveQuery(() => searchProducts(db, q), [db, q])
  const categories = useLiveQuery(() => db.categories.filter((c) => !c.deleted_at).toArray(), [db])
  const stock = useLiveQuery(
    async () => new Map((await db.stock_cache.toArray()).map((s) => [s.product_id, s.qty])),
    [db],
  )
  const costs = useLiveQuery(
    async () => new Map((await db.product_costs.toArray()).map((c) => [c.id, c.cost_price])),
    [db],
  )
  const { run } = useAction()
  if (!products || !categories || !stock || !costs) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Produits"
        action={
          manager ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCats(true)
                }}
              >
                Catégories
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowTemplates(true)
                }}
              >
                Modèles
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowImport(true)
                }}
              >
                <Upload className="h-5 w-5" aria-hidden="true" />
                Importer
              </Button>
              <Button
                onClick={() => {
                  setEditing('new')
                }}
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                Nouveau
              </Button>
            </div>
          ) : undefined
        }
      />
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-neutral-600"
          aria-hidden="true"
        />
        <input
          aria-label="Rechercher un produit"
          placeholder="Nom, code-barres, référence…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
          }}
          className="min-h-12 w-full rounded-xl border border-neutral-400 bg-white pl-11 pr-3 text-base"
        />
      </div>
      {products.length === 0 ? (
        <EmptyState
          title={q ? 'Aucun produit trouvé' : 'Aucun produit pour le moment'}
          description={
            manager
              ? 'Ajoutez votre premier produit ou importez un fichier CSV.'
              : 'Le propriétaire ou le gérant doit ajouter les produits.'
          }
        />
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
          {products.map((p) => {
            const qty = stock.get(p.id) ?? 0
            return (
              <li key={p.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
                <button
                  type="button"
                  disabled={!manager}
                  onClick={() => {
                    setEditing(p)
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-base font-semibold text-neutral-900">{p.name}</p>
                  <p className="text-sm text-neutral-700">
                    {isOpenAmount(p) ? 'Montant libre' : formatMoney(p.sale_price)}
                    {p.track_stock ? ` · ${formatQty(qty)} ${p.unit}` : ' · service'}
                  </p>
                </button>
                {!p.is_active ? (
                  <Badge>Inactif</Badge>
                ) : p.track_stock && qty < 0 ? (
                  <Badge tone="danger">Stock négatif</Badge>
                ) : p.track_stock && qty <= p.low_stock_threshold ? (
                  <Badge tone="warning">Stock bas</Badge>
                ) : null}
                {manager ? (
                  <Button
                    variant="ghost"
                    onClick={() => void run(() => setProductActive(ctx, p.id, !p.is_active))}
                  >
                    {p.is_active ? 'Désactiver' : 'Activer'}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {products.length >= 50 ? (
        <p className="mt-2 text-sm text-neutral-700">
          50 résultats affichés : précisez votre recherche.
        </p>
      ) : null}
      {editing ? (
        <ProductForm
          key={editing === 'new' ? 'new' : editing.id}
          product={editing === 'new' ? null : editing}
          cost={editing === 'new' ? null : (costs.get(editing.id) ?? null)}
          categories={categories}
          onClose={() => {
            setEditing(null)
          }}
        />
      ) : null}
      {showImport ? (
        <ImportModal
          onClose={() => {
            setShowImport(false)
          }}
        />
      ) : null}
      {showTemplates ? (
        <TemplatesModal
          onClose={() => {
            setShowTemplates(false)
          }}
        />
      ) : null}
      {showCats ? (
        <CategoriesModal
          onClose={() => {
            setShowCats(false)
          }}
        />
      ) : null}
    </div>
  )
}

function CategoriesModal({ onClose }: { onClose: () => void }) {
  const { db, ctx } = useSession()
  const cats = useLiveQuery(() => db.categories.filter((c) => !c.deleted_at).sortBy('name'), [db])
  const [name, setName] = useState('')
  const [editId, setEditId] = useState<string | undefined>()
  const { run, busy } = useAction()
  return (
    <Modal
      open
      title="Catégories"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="space-y-3">
        <ul className="divide-y divide-neutral-200">
          {(cats ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="min-h-11 w-full text-left text-base"
                onClick={() => {
                  setEditId(c.id)
                  setName(c.name)
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
        <Input
          label={editId ? 'Renommer la catégorie' : 'Nouvelle catégorie'}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
          }}
        />
        <Button
          loading={busy}
          onClick={() =>
            void run(async () => {
              await saveCategory(ctx, name, editId)
              setName('')
              setEditId(undefined)
            }, 'Catégorie enregistrée.')
          }
        >
          {editId ? 'Renommer' : 'Ajouter'}
        </Button>
      </div>
    </Modal>
  )
}
