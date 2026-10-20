import { useLiveQuery } from 'dexie-react-hooks'
import { lazy, Suspense } from 'react'
import { PageHeader, Stat, Card } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Skeleton } from '@/components/Skeleton'
import { useSession } from '@/auth/context'
import { isManager } from '@/db/ctx'
import { fr } from '@/i18n/fr'
import { addDays, periodRange } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { buildReport, lowStock, openDebts } from '@/lib/reports'

const SalesChart = lazy(() => import('./SalesChart'))

export default function DashboardPage() {
  const { db, ctx } = useSession()
  const manager = isManager(ctx)
  const data = useLiveQuery(async () => {
    const [sales, items, payments, expenses, products, balances, stock] = await Promise.all([
      db.sales.toArray(),
      db.sale_items.toArray(),
      db.sale_payments.toArray(),
      db.expenses.toArray(),
      db.products.toArray(),
      db.balance_cache.toArray(),
      db.stock_cache.toArray(),
    ])
    return {
      sales,
      items,
      payments,
      expenses,
      products,
      balances,
      stock: new Map(stock.map((s) => [s.product_id, s.qty])),
    }
  }, [db])
  if (!data) return <PageSkeleton />
  const mine = manager ? data.sales : data.sales.filter((s) => s.created_by === ctx.userId)
  const input = {
    sales: mine,
    items: data.items,
    payments: data.payments,
    expenses: manager ? data.expenses : [],
  }
  const today = buildReport({ ...input, range: periodRange('today', new Date()) })
  const week = buildReport({ ...input, range: periodRange('7d', new Date()) })
  const days = Array.from({ length: 7 }, (_, i) =>
    addDays(new Date(`${periodRange('today', new Date()).from}`), i - 6)
      .toISOString()
      .slice(0, 10),
  ).map((day) => ({ day, total: week.byDay.find((d) => d.day === day)?.total ?? 0 }))
  const low = lowStock(data.products, data.stock)
  return (
    <div className="space-y-4">
      <PageHeader title={fr.nav.dashboard} hint={manager ? undefined : 'Vos ventes du jour'} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Ventes du jour" value={formatMoney(today.revenue)} tone="good" />
        <Stat label="Nombre de ventes" value={String(today.salesCount)} />
        {manager ? (
          <>
            <Stat
              label="Bénéfice brut du jour"
              value={formatMoney(today.grossProfit)}
              tone="good"
            />
            <Stat label="Dépenses du jour" value={formatMoney(today.expensesTotal)} />
            <Stat
              label="Dettes des clients"
              value={formatMoney(openDebts(data.balances))}
              tone="bad"
            />
            <Stat
              label="Produits en stock bas"
              value={String(low.length)}
              tone={low.length ? 'bad' : 'default'}
            />
          </>
        ) : null}
      </div>
      <Card>
        <h2 className="mb-2 text-lg font-bold">7 derniers jours</h2>
        <Suspense fallback={<Skeleton className="h-56 w-full" />}>
          <SalesChart data={days} />
        </Suspense>
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-bold">Ventes par mode de paiement (aujourd’hui)</h2>
        {today.byMethod.length === 0 ? (
          <p className="text-base text-neutral-700">Aucune vente aujourd’hui.</p>
        ) : (
          <ul className="space-y-1 text-base">
            {today.byMethod.map((m) => (
              <li key={m.method} className="flex justify-between">
                <span>{(fr.methods as Record<string, string>)[m.method] ?? m.method}</span>
                <b>{formatMoney(m.amount)}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
