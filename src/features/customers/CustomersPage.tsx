import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Send } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Select } from '@/components/Select'
import { useSession } from '@/auth/context'
import { isManager } from '@/db/ctx'
import { adjustBalance, recordDebtPayment, saveCustomer } from '@/db/repositories/people'
import { PAYMENT_METHODS, type Customer, type PaymentMethod } from '@/db/schemas'
import { fr } from '@/i18n/fr'
import { useAction } from '@/hooks/useAction'
import { formatDateTime } from '@/lib/dates'
import { formatMoney, parseMoney } from '@/lib/money'
import { statementText, whatsappUrl } from '@/lib/receipt'
import { normalizeText } from '@/lib/text'

export default function CustomersPage() {
  const { db, ctx } = useSession()
  const [q, setQ] = useState('')
  const [debtors, setDebtors] = useState(false)
  const [open, setOpen] = useState<Customer | 'new' | null>(null)
  const data = useLiveQuery(
    async () => ({
      customers: await db.customers.filter((c) => !c.deleted_at).toArray(),
      balances: new Map((await db.balance_cache.toArray()).map((b) => [b.customer_id, b.balance])),
    }),
    [db],
  )
  if (!data) return <PageSkeleton />
  const needle = normalizeText(q)
  const rows = data.customers
    .filter(
      (c) =>
        !needle || normalizeText(c.name).includes(needle) || (c.phone ?? '').includes(q.trim()),
    )
    .filter((c) => !debtors || (data.balances.get(c.id) ?? 0) > 0)
    .sort((a, b) =>
      debtors
        ? (data.balances.get(b.id) ?? 0) - (data.balances.get(a.id) ?? 0)
        : a.name.localeCompare(b.name),
    )
  const totalDebt = [...data.balances.values()].reduce((s, b) => s + Math.max(0, b), 0)
  return (
    <div className="space-y-4">
      <PageHeader
        title="Clients"
        hint={`Dettes à encaisser : ${formatMoney(totalDebt)}`}
        action={
          <Button
            onClick={() => {
              setOpen('new')
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Nouveau
          </Button>
        }
      />
      <Input
        label="Rechercher un client"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
        }}
      />
      <label className="flex min-h-11 items-center gap-3 text-base font-semibold">
        <input
          type="checkbox"
          className="h-5 w-5"
          checked={debtors}
          onChange={(e) => {
            setDebtors(e.target.checked)
          }}
        />
        Seulement les débiteurs (plus gros d’abord)
      </label>
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun client"
          description={
            isManager(ctx) ? 'Ajoutez vos clients pour suivre leurs crédits.' : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
          {rows.map((c) => {
            const b = data.balances.get(c.id) ?? 0
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(c)
                  }}
                  className="flex min-h-16 w-full items-center justify-between gap-2 px-4 py-2 text-left"
                >
                  <span>
                    <span className="block text-base font-semibold">{c.name}</span>
                    <span className="text-sm text-neutral-700">{c.phone ?? 'Sans téléphone'}</span>
                  </span>
                  {b > 0 ? (
                    <Badge tone="danger">Doit {formatMoney(b)}</Badge>
                  ) : (
                    <Badge tone="success">À jour</Badge>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open === 'new' ? (
        <CustomerForm
          customer={null}
          onClose={() => {
            setOpen(null)
          }}
        />
      ) : null}
      {open && open !== 'new' ? (
        <CustomerDetail
          customer={open}
          onClose={() => {
            setOpen(null)
          }}
        />
      ) : null}
    </div>
  )
}

function CustomerForm({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { ctx } = useSession()
  const [f, setF] = useState({
    name: customer?.name ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    note: customer?.note ?? '',
    limit: customer?.credit_limit != null ? String(customer.credit_limit) : '',
  })
  const { run, busy } = useAction()
  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }))
  }
  return (
    <Modal
      open
      title={customer ? 'Modifier le client' : 'Nouveau client'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            loading={busy}
            onClick={() =>
              void run(async () => {
                await saveCustomer(
                  ctx,
                  {
                    name: f.name,
                    phone: f.phone,
                    address: f.address,
                    note: f.note,
                    credit_limit: f.limit.trim() ? parseMoney(f.limit) : null,
                  },
                  customer?.id,
                )
                onClose()
              }, 'Client enregistré.')
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
            set('name', e.target.value)
          }}
        />
        <Input
          label="Téléphone"
          inputMode="tel"
          value={f.phone}
          onChange={(e) => {
            set('phone', e.target.value)
          }}
        />
        <Input
          label="Adresse (facultatif)"
          value={f.address}
          onChange={(e) => {
            set('address', e.target.value)
          }}
        />
        {isManager(ctx) ? (
          <Input
            label="Plafond de crédit (FCFA, facultatif)"
            inputMode="numeric"
            value={f.limit}
            onChange={(e) => {
              set('limit', e.target.value)
            }}
            hint="Un avertissement s’affiche si le plafond est dépassé, sans bloquer la vente."
          />
        ) : null}
        <Input
          label="Note (facultatif)"
          value={f.note}
          onChange={(e) => {
            set('note', e.target.value)
          }}
        />
      </div>
    </Modal>
  )
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const { db, ctx, shop } = useSession()
  const entries = useLiveQuery(
    async () =>
      (await db.customer_ledger.where('customer_id').equals(customer.id).toArray()).sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      ),
    [db, customer.id],
  )
  const balance = useLiveQuery(
    async () => (await db.balance_cache.get(customer.id))?.balance ?? 0,
    [db, customer.id],
  )
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [adjust, setAdjust] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const { run, busy } = useAction()
  const manager = isManager(ctx)
  if (editing)
    return (
      <CustomerForm
        customer={customer}
        onClose={() => {
          setEditing(false)
        }}
      />
    )
  const text = statementText(
    shop.name,
    customer.name,
    balance ?? 0,
    (entries ?? []).map((e) => ({
      date: e.created_at,
      label: fr.ledger[e.type],
      amount: e.amount,
    })),
  )
  const url = customer.phone ? whatsappUrl(customer.phone, text) : null
  return (
    <Modal
      open
      title={customer.name}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-neutral-100 p-3 text-center">
          <p className="text-sm font-semibold text-neutral-700">Solde à payer</p>
          <p
            className={`text-3xl font-bold ${(balance ?? 0) > 0 ? 'text-red-800' : 'text-brand-800'}`}
          >
            {formatMoney(Math.max(0, balance ?? 0))}
          </p>
          {customer.credit_limit != null ? (
            <p className="text-sm text-neutral-700">
              Plafond : {formatMoney(customer.credit_limit)}
            </p>
          ) : null}
        </div>
        <div className="space-y-2 rounded-xl border border-neutral-300 p-3">
          <p className="text-base font-semibold">Encaisser un remboursement</p>
          <Input
            label="Montant (FCFA)"
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
            }}
          />
          <Select
            label="Mode de paiement"
            value={method}
            onChange={(v) => {
              setMethod(PAYMENT_METHODS.find((m) => m === v) ?? 'cash')
            }}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: fr.methods[m] }))}
          />
          <Button
            loading={busy}
            onClick={() =>
              void run(async () => {
                await recordDebtPayment(ctx, {
                  customer_id: customer.id,
                  amount: parseMoney(amount) ?? 0,
                  method,
                })
                setAmount('')
              }, 'Remboursement enregistré.')
            }
          >
            Encaisser
          </Button>
        </div>
        {manager ? (
          <div className="space-y-2 rounded-xl border border-neutral-300 p-3">
            <p className="text-base font-semibold">Corriger le solde (gérant)</p>
            <Input
              label="Montant (+ le client doit plus, − moins)"
              inputMode="numeric"
              value={adjust}
              onChange={(e) => {
                setAdjust(e.target.value)
              }}
            />
            <Input
              label="Motif"
              value={note}
              onChange={(e) => {
                setNote(e.target.value)
              }}
            />
            <Button
              variant="secondary"
              loading={busy}
              onClick={() =>
                void run(async () => {
                  await adjustBalance(ctx, {
                    customer_id: customer.id,
                    amount: Number(adjust.replace(/\s/g, '')),
                    note,
                  })
                  setAdjust('')
                  setNote('')
                }, 'Solde corrigé.')
              }
            >
              Corriger
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {manager ? (
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(true)
              }}
            >
              Modifier la fiche
            </Button>
          ) : null}
          {url ? (
            <a
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent-400 px-4 text-base font-semibold text-brand-900"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Send className="h-5 w-5" aria-hidden="true" />
              Relevé par WhatsApp
            </a>
          ) : null}
        </div>
        <ul className="divide-y divide-neutral-200 text-base">
          {(entries ?? []).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="block font-semibold">{fr.ledger[e.type]}</span>
                <span className="text-sm text-neutral-700">
                  {formatDateTime(e.created_at)}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
              </span>
              <b className={e.amount > 0 ? 'text-red-800' : 'text-brand-800'}>
                {e.amount > 0 ? '+' : ''}
                {formatMoney(e.amount)}
              </b>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}
