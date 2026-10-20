import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useSession } from '@/auth/context'
import { saveSupplier } from '@/db/repositories/people'
import type { Supplier } from '@/db/schemas'
import { useAction } from '@/hooks/useAction'
import { formatDateTime } from '@/lib/dates'
import { formatMoney, formatQty } from '@/lib/money'

export default function SuppliersPage() {
  const { db, ctx } = useSession()
  const suppliers = useLiveQuery(
    () => db.suppliers.filter((s) => !s.deleted_at).sortBy('name'),
    [db],
  )
  const [edit, setEdit] = useState<Supplier | 'new' | null>(null)
  const [history, setHistory] = useState<Supplier | null>(null)
  const [f, setF] = useState({ name: '', phone: '', note: '' })
  const { run, busy } = useAction()
  const purchases = useLiveQuery(
    async () =>
      history
        ? (await db.stock_movements.filter((m) => m.supplier_id === history.id).toArray())
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 50)
        : [],
    [db, history?.id],
  )
  const products = useLiveQuery(
    async () => new Map((await db.products.toArray()).map((p) => [p.id, p.name])),
    [db],
  )
  if (!suppliers) return <PageSkeleton />
  const open = (s: Supplier | 'new') => {
    setF(
      s === 'new'
        ? { name: '', phone: '', note: '' }
        : { name: s.name, phone: s.phone ?? '', note: s.note ?? '' },
    )
    setEdit(s)
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Fournisseurs"
        action={
          <Button
            onClick={() => {
              open('new')
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Nouveau
          </Button>
        }
      />
      {suppliers.length === 0 ? (
        <EmptyState
          title="Aucun fournisseur"
          description="Ajoutez vos fournisseurs pour suivre vos achats."
        />
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
          {suppliers.map((s) => (
            <li key={s.id} className="flex min-h-16 items-center justify-between gap-2 px-4 py-2">
              <span>
                <span className="block text-base font-semibold">{s.name}</span>
                <span className="text-sm text-neutral-700">{s.phone ?? 'Sans téléphone'}</span>
              </span>
              <span className="flex gap-1">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setHistory(s)
                  }}
                >
                  Achats
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    open(s)
                  }}
                >
                  Modifier
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {edit ? (
        <Modal
          open
          title={edit === 'new' ? 'Nouveau fournisseur' : 'Modifier le fournisseur'}
          onClose={() => {
            setEdit(null)
          }}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setEdit(null)
                }}
              >
                Annuler
              </Button>
              <Button
                loading={busy}
                onClick={() =>
                  void run(async () => {
                    await saveSupplier(ctx, f, edit === 'new' ? undefined : edit.id)
                    setEdit(null)
                  }, 'Fournisseur enregistré.')
                }
              >
                Enregistrer
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Input
              label="Nom"
              value={f.name}
              onChange={(e) => {
                setF({ ...f, name: e.target.value })
              }}
            />
            <Input
              label="Téléphone"
              inputMode="tel"
              value={f.phone}
              onChange={(e) => {
                setF({ ...f, phone: e.target.value })
              }}
            />
            <Input
              label="Note"
              value={f.note}
              onChange={(e) => {
                setF({ ...f, note: e.target.value })
              }}
            />
          </div>
        </Modal>
      ) : null}
      {history ? (
        <Modal
          open
          title={`Achats — ${history.name}`}
          onClose={() => {
            setHistory(null)
          }}
          footer={
            <Button
              variant="secondary"
              onClick={() => {
                setHistory(null)
              }}
            >
              Fermer
            </Button>
          }
        >
          {(purchases ?? []).length === 0 ? (
            <p className="text-base">Aucune entrée de stock liée à ce fournisseur.</p>
          ) : (
            <ul className="divide-y divide-neutral-200 text-base">
              {(purchases ?? []).map((m) => (
                <li key={m.id} className="flex justify-between gap-2 py-2">
                  <span>
                    <span className="block font-semibold">
                      {products?.get(m.product_id) ?? 'Produit'}
                    </span>
                    <span className="text-sm text-neutral-700">{formatDateTime(m.created_at)}</span>
                  </span>
                  <span className="text-right">
                    +{formatQty(m.qty)}
                    {m.unit_cost !== null ? (
                      <span className="block text-sm text-neutral-700">
                        {formatMoney(m.unit_cost)} l’unité
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      ) : null}
    </div>
  )
}
