import { useLiveQuery } from 'dexie-react-hooks'
import { ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Card, PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useSession } from '@/auth/context'
import { fr } from '@/i18n/fr'
import { analyzeControl, saleAnomalies, totalFindings } from '@/lib/control'
import { formatDateTime } from '@/lib/dates'
import { formatMoney, formatQty } from '@/lib/money'

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  if (count === 0) return null
  return (
    <Card>
      <h2 className="mb-2 text-lg font-bold">
        {title} <span className="text-neutral-700">({count})</span>
      </h2>
      <ul className="divide-y divide-neutral-200 text-base">{children}</ul>
    </Card>
  )
}
const who = (id: string | null, me: string) => (id === me ? 'Moi' : id ? `…${id.slice(-4)}` : '?')

/** Détection des écarts : prix cassés, remises, annulations, ajustements, stock négatif, anomalies. Chaque ligne cite l'utilisateur et l'appareil. */
export default function ControlPage() {
  const { db, ctx, settings } = useSession()
  const data = useLiveQuery(async () => {
    const [sales, items, payments, movements, products, stock, failed] = await Promise.all([
      db.sales.toArray(),
      db.sale_items.toArray(),
      db.sale_payments.toArray(),
      db.stock_movements.toArray(),
      db.products.toArray(),
      db.stock_cache.toArray(),
      db.outbox_failed.count(),
    ])
    return {
      sales,
      items,
      payments,
      movements,
      products,
      stock: new Map(stock.map((s) => [s.product_id, s.qty])),
      failed,
    }
  }, [db])
  if (!data) return <PageSkeleton />
  const r = analyzeControl({ ...data, discountThresholdPct: settings.discount_cap_pct })
  const anomalies = saleAnomalies(data.sales, data.items, data.payments, new Date())
  const total = totalFindings(r) + anomalies.length + data.failed
  const names = new Map(data.products.map((p) => [p.id, p.name]))
  const row = (key: string, left: ReactNode, right: ReactNode) => (
    <li key={key} className="flex items-start justify-between gap-2 py-2">
      <span>{left}</span>
      <b className="shrink-0">{right}</b>
    </li>
  )
  return (
    <div className="space-y-4">
      <PageHeader
        title="Contrôle"
        hint="Repérez les écarts. Hors ligne, rien n’est bloqué : tout est tracé ici."
      />
      {total === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Rien à signaler"
          description="Aucun écart détecté dans les données de cet appareil."
        />
      ) : null}
      <Section title="Éléments non envoyés au serveur (rejetés)" count={data.failed}>
        {row('f', 'Voir « Paramètres > Synchronisation »', data.failed)}
      </Section>
      <Section title="Ventes incohérentes" count={anomalies.length}>
        {anomalies.map((a, i) =>
          row(
            `${a.sale.id}-${i}`,
            <>
              <span className="block font-semibold">{a.sale.receipt_no}</span>
              <span className="text-sm text-neutral-700">{a.problem}</span>
            </>,
            formatMoney(a.sale.total),
          ),
        )}
      </Section>
      <Section title="Ventes sous le prix catalogue" count={r.belowListPrice.length}>
        {r.belowListPrice.map(({ sale, item, gap }) =>
          row(
            item.id,
            <>
              <span className="block font-semibold">
                {item.name_snapshot} · {sale.receipt_no}
              </span>
              <span className="text-sm text-neutral-700">
                {formatDateTime(sale.created_at)} · {who(sale.created_by, ctx.userId)} · appareil{' '}
                {sale.device_id?.slice(0, 4) ?? '?'}
              </span>
            </>,
            `-${formatMoney(gap)}`,
          ),
        )}
      </Section>
      <Section title="Remises élevées" count={r.highDiscounts.length}>
        {r.highDiscounts.map(({ sale, pct }) =>
          row(
            sale.id,
            <>
              <span className="block font-semibold">{sale.receipt_no}</span>
              <span className="text-sm text-neutral-700">
                {formatDateTime(sale.created_at)} · {who(sale.created_by, ctx.userId)}
              </span>
            </>,
            `${pct} %`,
          ),
        )}
      </Section>
      <Section title="Ventes hors limites (sans accord du gérant)" count={r.overrides.length}>
        {r.overrides.map((s) =>
          row(
            s.id,
            <>
              <span className="block font-semibold">{s.receipt_no}</span>
              <span className="text-sm text-neutral-700">
                {formatDateTime(s.created_at)} · {who(s.created_by, ctx.userId)} · appareil{' '}
                {s.device_id?.slice(0, 4) ?? '?'}
              </span>
            </>,
            formatMoney(s.total),
          ),
        )}
      </Section>
      <Section title="Annulations par utilisateur" count={r.voids.length}>
        {r.voids.map((v) =>
          row(v.user, who(v.user, ctx.userId), `${v.count} · ${formatMoney(v.total)}`),
        )}
      </Section>
      <Section title="Ajustements et pertes de stock" count={r.adjustments.length}>
        {r.adjustments.slice(0, 30).map((m) =>
          row(
            m.id,
            <>
              <span className="block font-semibold">
                {names.get(m.product_id) ?? 'Produit'} · {fr.movements[m.type]}
              </span>
              <span className="text-sm text-neutral-700">
                {formatDateTime(m.created_at)} · {who(m.created_by, ctx.userId)}
                {m.note ? ` · ${m.note}` : ''}
              </span>
            </>,
            formatQty(m.qty),
          ),
        )}
      </Section>
      <Section title="Stocks négatifs" count={r.negativeStock.length}>
        {r.negativeStock.map(({ product, qty }) => row(product.id, product.name, formatQty(qty)))}
      </Section>
      <Section
        title="Ventes à des heures inhabituelles (avant 6 h, après 22 h)"
        count={r.oddHours.length}
      >
        {r.oddHours.map((s) =>
          row(
            s.id,
            <>
              <span className="block font-semibold">{s.receipt_no}</span>
              <span className="text-sm text-neutral-700">
                {formatDateTime(s.created_at)} · {who(s.created_by, ctx.userId)}
              </span>
            </>,
            formatMoney(s.total),
          ),
        )}
      </Section>
    </div>
  )
}
