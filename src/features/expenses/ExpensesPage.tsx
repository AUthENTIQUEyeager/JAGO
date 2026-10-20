import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/Input'
import { PageHeader, Stat } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Tabs } from '@/components/Tabs'
import { useSession } from '@/auth/context'
import { deleteExpense, saveExpense } from '@/db/repositories/people'
import { useAction } from '@/hooks/useAction'
import { dayKey, formatDate, periodRange, todayInput, type Period } from '@/lib/dates'
import { formatMoney, parseMoney } from '@/lib/money'

export default function ExpensesPage() {
  const { db, ctx } = useSession()
  const [period, setPeriod] = useState<Period>('month')
  const [f, setF] = useState({ label: '', category: '', amount: '', date: todayInput() })
  const [del, setDel] = useState<string | null>(null)
  const { run, busy } = useAction()
  const range = periodRange(period, new Date())
  const rows = useLiveQuery(
    async () =>
      (
        await db.expenses
          .filter(
            (e) =>
              !e.deleted_at &&
              e.expense_date >= dayKey(range.from) &&
              e.expense_date < dayKey(range.to),
          )
          .toArray()
      ).sort((a, b) => b.expense_date.localeCompare(a.expense_date)),
    [db, period],
  )
  if (!rows) return <PageSkeleton />
  return (
    <div className="space-y-4">
      <PageHeader title="Dépenses" />
      <div className="space-y-3 rounded-2xl border border-neutral-300 bg-white p-4">
        <Input
          label="Libellé"
          value={f.label}
          onChange={(e) => {
            setF({ ...f, label: e.target.value })
          }}
          placeholder="Loyer, électricité, transport…"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Montant (FCFA)"
            inputMode="numeric"
            value={f.amount}
            onChange={(e) => {
              setF({ ...f, amount: e.target.value })
            }}
          />
          <Input
            label="Date"
            type="date"
            value={f.date}
            onChange={(e) => {
              setF({ ...f, date: e.target.value })
            }}
          />
        </div>
        <Input
          label="Catégorie (facultatif)"
          value={f.category}
          onChange={(e) => {
            setF({ ...f, category: e.target.value })
          }}
        />
        <Button
          size="lg"
          fullWidth
          loading={busy}
          onClick={() =>
            void run(async () => {
              await saveExpense(ctx, {
                label: f.label,
                category: f.category,
                amount: parseMoney(f.amount) ?? 0,
                expense_date: f.date,
              })
              setF({ ...f, label: '', amount: '', category: '' })
            }, 'Dépense enregistrée.')
          }
        >
          Enregistrer la dépense
        </Button>
      </div>
      <Tabs
        idPrefix="exp"
        ariaLabel="Période"
        tabs={[
          { id: 'today', label: 'Aujourd’hui' },
          { id: '7d', label: '7 jours' },
          { id: 'month', label: 'Ce mois' },
        ]}
        value={period}
        onChange={(v) => {
          setPeriod(v as Period)
        }}
      />
      <Stat
        label="Total de la période"
        value={formatMoney(rows.reduce((s, e) => s + e.amount, 0))}
      />
      {rows.length === 0 ? (
        <EmptyState title="Aucune dépense sur cette période" />
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
          {rows.map((e) => (
            <li key={e.id} className="flex min-h-16 items-center justify-between gap-2 px-4 py-2">
              <span>
                <span className="block text-base font-semibold">{e.label}</span>
                <span className="text-sm text-neutral-700">
                  {formatDate(`${e.expense_date}T00:00:00Z`)}
                  {e.category ? ` · ${e.category}` : ''}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <b className="text-lg">{formatMoney(e.amount)}</b>
                <button
                  type="button"
                  aria-label={`Supprimer ${e.label}`}
                  onClick={() => {
                    setDel(e.id)
                  }}
                  className="flex h-11 w-11 items-center justify-center text-red-700"
                >
                  <Trash2 className="h-5 w-5" aria-hidden="true" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={del !== null}
        tone="danger"
        loading={busy}
        title="Supprimer cette dépense ?"
        message="Elle sera retirée des totaux."
        confirmLabel="Supprimer"
        onCancel={() => {
          setDel(null)
        }}
        onConfirm={() =>
          void run(async () => {
            if (del) await deleteExpense(ctx, del)
            setDel(null)
          }, 'Dépense supprimée.')
        }
      />
    </div>
  )
}
