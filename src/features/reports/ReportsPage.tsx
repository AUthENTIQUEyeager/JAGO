import { useLiveQuery } from 'dexie-react-hooks'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { PageHeader, Stat, Card } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Tabs } from '@/components/Tabs'
import { useSession } from '@/auth/context'
import { fr } from '@/i18n/fr'
import { toCsv } from '@/lib/csv'
import { formatDateTime, periodRange, todayInput, type Period } from '@/lib/dates'
import { downloadText } from '@/lib/download'
import { formatMoney, formatQty } from '@/lib/money'
import { buildReport, openDebts, stockValue } from '@/lib/reports'

export default function ReportsPage() {
  const { db, ctx } = useSession()
  const [period, setPeriod] = useState<Period>('month')
  const [custom, setCustom] = useState({ from: todayInput(), to: todayInput() })
  const data = useLiveQuery(async () => {
    const [sales, items, payments, expenses, products, balances, stock, costs] = await Promise.all([
      db.sales.toArray(),
      db.sale_items.toArray(),
      db.sale_payments.toArray(),
      db.expenses.toArray(),
      db.products.toArray(),
      db.balance_cache.toArray(),
      db.stock_cache.toArray(),
      db.product_costs.toArray(),
    ])
    return {
      sales,
      items,
      payments,
      expenses,
      products,
      balances,
      stock: new Map(stock.map((s) => [s.product_id, s.qty])),
      costs: new Map(costs.map((c) => [c.id, c])),
    }
  }, [db])
  if (!data) return <PageSkeleton />
  const range = periodRange(period, new Date(), custom)
  const r = buildReport({ ...data, range })
  const label = (id: string) => (id === ctx.userId ? 'Moi' : `Utilisateur …${id.slice(-4)}`)

  function exportCsv() {
    const inRangeSales =
      data?.sales.filter(
        (s) => s.created_at >= range.from && s.created_at < range.to && !s.deleted_at,
      ) ?? []
    downloadText(
      `rapport-${range.from.slice(0, 10)}.csv`,
      toCsv(
        ['Reçu', 'Date', 'Statut', 'Total', 'Payé', 'Crédit', 'Remise'],
        inRangeSales.map((s) => [
          s.receipt_no,
          formatDateTime(s.created_at),
          s.status === 'voided' ? 'Annulée' : 'Validée',
          s.total,
          s.paid_total,
          s.credit_amount,
          s.discount,
        ]),
      ),
    )
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title="Rapports"
        action={
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-5 w-5" aria-hidden="true" />
            Exporter (CSV)
          </Button>
        }
      />
      <Tabs
        idPrefix="rep"
        ariaLabel="Période"
        tabs={[
          { id: 'today', label: 'Aujourd’hui' },
          { id: '7d', label: '7 jours' },
          { id: 'month', label: 'Ce mois' },
          { id: 'custom', label: 'Personnalisée' },
        ]}
        value={period}
        onChange={(v) => {
          setPeriod(v as Period)
        }}
      />
      {period === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Du"
            type="date"
            value={custom.from}
            onChange={(e) => {
              setCustom({ ...custom, from: e.target.value })
            }}
          />
          <Input
            label="Au"
            type="date"
            value={custom.to}
            onChange={(e) => {
              setCustom({ ...custom, to: e.target.value })
            }}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Chiffre d’affaires" value={formatMoney(r.revenue)} tone="good" />
        <Stat label="Nombre de ventes" value={String(r.salesCount)} />
        <Stat label="Bénéfice brut" value={formatMoney(r.grossProfit)} tone="good" />
        <Stat label="Dépenses" value={formatMoney(r.expensesTotal)} />
        <Stat
          label="Bénéfice net (approximatif)"
          value={formatMoney(r.netProfit)}
          tone={r.netProfit < 0 ? 'bad' : 'good'}
        />
        <Stat label="Dettes ouvertes" value={formatMoney(openDebts(data.balances))} tone="bad" />
        <Stat
          label="Valeur du stock"
          value={formatMoney(stockValue(data.products, data.stock, data.costs))}
        />
      </div>
      {!r.profitComplete ? (
        <p className="rounded-xl bg-accent-50 p-3 text-base text-accent-900">
          Certaines ventes n’ont pas de prix d’achat connu : le bénéfice est sous-estimé.
        </p>
      ) : null}
      <Card>
        <h2 className="mb-2 text-lg font-bold">Produits les plus vendus</h2>
        <ol className="space-y-1 text-base">
          {r.topProducts.map((p) => (
            <li key={p.product_id} className="flex justify-between gap-2">
              <span className="truncate">
                {p.name} <span className="text-neutral-700">× {formatQty(p.qty)}</span>
              </span>
              <b>{formatMoney(p.revenue)}</b>
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-bold">Ventes par utilisateur</h2>
          <ul className="space-y-1 text-base">
            {r.byCashier.map((c) => (
              <li key={c.user} className="flex justify-between">
                <span>
                  {label(c.user)} ({c.count})
                </span>
                <b>{formatMoney(c.total)}</b>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-bold">Ventes par mode de paiement</h2>
          <ul className="space-y-1 text-base">
            {r.byMethod.map((m) => (
              <li key={m.method} className="flex justify-between">
                <span>{(fr.methods as Record<string, string>)[m.method] ?? m.method}</span>
                <b>{formatMoney(m.amount)}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
