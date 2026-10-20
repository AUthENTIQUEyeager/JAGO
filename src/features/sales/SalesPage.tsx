import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Select } from '@/components/Select'
import { Tabs } from '@/components/Tabs'
import { useSession } from '@/auth/context'
import { isManager } from '@/db/ctx'
import { voidSale } from '@/db/repositories/sales'
import { fr } from '@/i18n/fr'
import { useAction } from '@/hooks/useAction'
import { formatDateTime, inRange, periodRange, type Period } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { normalizeText } from '@/lib/text'
import { buildReceiptData } from '../pos/receiptData'
import { ReceiptView } from '../pos/ReceiptView'

const PERIODS = [
  { id: 'today', label: 'Aujourd’hui' },
  { id: '7d', label: '7 jours' },
  { id: 'month', label: 'Ce mois' },
]

export default function SalesPage() {
  const { db, ctx } = useSession()
  const manager = isManager(ctx)
  const [period, setPeriod] = useState<Period>('today')
  const [q, setQ] = useState('')
  const [method, setMethod] = useState('')
  const [user, setUser] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const range = periodRange(period, new Date())
  const data = useLiveQuery(async () => {
    const sales = (
      await db.sales
        .where('created_at')
        .between(range.from, range.to, true, false)
        .reverse()
        .toArray()
    ).filter((s) => !s.deleted_at)
    const payments = await db.sale_payments.toArray()
    const customers = new Map((await db.customers.toArray()).map((c) => [c.id, c.name]))
    return { sales, payments, customers }
  }, [db, period])
  if (!data) return <PageSkeleton />
  const users = [...new Set(data.sales.map((s) => s.created_by ?? ''))].filter(Boolean)
  const rows = data.sales
    .filter((s) => {
      if (!manager && s.created_by !== ctx.userId) return false
      if (user && s.created_by !== user) return false
      if (method && !data.payments.some((p) => p.sale_id === s.id && p.method === method))
        return false
      const needle = normalizeText(q)
      return (
        !needle ||
        normalizeText(s.receipt_no).includes(needle) ||
        normalizeText(data.customers.get(s.customer_id ?? '') ?? '').includes(needle)
      )
    })
    .filter((s) => inRange(s.created_at, range))

  return (
    <div className="space-y-4">
      <PageHeader title="Ventes" hint={`${rows.length} vente(s)`} />
      <Tabs
        idPrefix="sales"
        ariaLabel="Période"
        tabs={PERIODS}
        value={period}
        onChange={(v) => {
          setPeriod(v as Period)
        }}
      />
      <Input
        label="Rechercher (n° de reçu, client)"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select
          label="Mode de paiement"
          value={method}
          onChange={setMethod}
          options={[
            { value: '', label: 'Tous' },
            ...Object.entries(fr.methods).map(([value, label]) => ({ value, label })),
          ]}
        />
        {manager ? (
          <Select
            label="Utilisateur"
            value={user}
            onChange={setUser}
            options={[
              { value: '', label: 'Tous' },
              ...users.map((u) => ({
                value: u,
                label: u === ctx.userId ? 'Moi' : `…${u.slice(-4)}`,
              })),
            ]}
          />
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Aucune vente sur cette période" />
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
          {rows.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(s.id)
                }}
                className="flex min-h-16 w-full items-center justify-between gap-2 px-4 py-2 text-left"
              >
                <span>
                  <span className="block text-base font-semibold">{s.receipt_no}</span>
                  <span className="text-sm text-neutral-700">
                    {formatDateTime(s.created_at)}
                    {s.customer_id ? ` · ${data.customers.get(s.customer_id) ?? ''}` : ''}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="text-lg font-bold">{formatMoney(s.total)}</span>
                  {s.status === 'voided' ? (
                    <Badge tone="danger">Annulée</Badge>
                  ) : s.credit_amount > 0 ? (
                    <Badge tone="warning">Crédit</Badge>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <SaleDetail
          id={open}
          onClose={() => {
            setOpen(null)
          }}
        />
      ) : null}
    </div>
  )
}

function SaleDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, ctx, shop, settings } = useSession()
  const sale = useLiveQuery(() => db.sales.get(id), [db, id])
  const receipt = useLiveQuery(() => buildReceiptData(db, id, shop.name, settings), [db, id])
  const phone = useLiveQuery(
    async () =>
      sale?.customer_id ? ((await db.customers.get(sale.customer_id))?.phone ?? null) : null,
    [db, sale?.customer_id],
  )
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const { run, busy } = useAction()
  return (
    <Modal
      open
      title={sale ? `Vente ${sale.receipt_no}` : 'Vente'}
      onClose={onClose}
      footer={
        <>
          {isManager(ctx) && sale?.status === 'completed' ? (
            <Button
              variant="danger"
              onClick={() => {
                setVoiding(true)
              }}
            >
              Annuler la vente
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </>
      }
    >
      {sale?.status === 'voided' ? (
        <p role="status" className="mb-3 rounded-xl bg-red-50 p-3 text-base text-red-900">
          Vente annulée{sale.void_reason ? ` : ${sale.void_reason}` : ''}.
        </p>
      ) : null}
      {sale?.override ? (
        <p className="mb-3 rounded-xl bg-accent-50 p-3 text-base text-accent-900">
          Remise ou prix hors limites (sans accord du gérant).
        </p>
      ) : null}
      {receipt ? <ReceiptView data={receipt} customerPhone={phone} /> : null}
      <ConfirmDialog
        open={voiding}
        tone="danger"
        loading={busy}
        title="Annuler cette vente ?"
        message="Le stock sera remis et la dette du client corrigée. La vente reste visible, marquée « annulée »."
        confirmLabel="Annuler la vente"
        cancelLabel="Garder"
        onCancel={() => {
          setVoiding(false)
        }}
        onConfirm={() =>
          void run(async () => {
            await voidSale(ctx, id, reason)
            setVoiding(false)
          }, 'Vente annulée.')
        }
      >
        <div className="mt-3">
          <Input
            label="Motif de l’annulation (obligatoire)"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
            }}
          />
        </div>
      </ConfirmDialog>
    </Modal>
  )
}
