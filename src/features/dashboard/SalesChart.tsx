import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatMoney } from '@/lib/money'

/** Graphique chargé à la demande (recharts est lourd : il ne pèse pas sur le premier affichage). */
export default function SalesChart({ data }: { data: Array<{ day: string; total: number }> }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Ventes des 7 derniers jours">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data.map((d) => ({ ...d, label: d.day.slice(8) + '/' + d.day.slice(5, 7) }))}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" />
          <YAxis
            width={56}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip formatter={(v) => formatMoney(Number(v))} />
          <Bar dataKey="total" fill="#155c43" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
