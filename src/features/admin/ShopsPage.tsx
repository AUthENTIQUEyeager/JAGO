import { Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CredentialsCard } from '@/components/CredentialsCard'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { PageHeader, Card } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Select } from '@/components/Select'
import { useToast } from '@/components/toast/useToast'
import { useAuth } from '@/auth/context'
import { apiCall } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { generatePassword } from '@/lib/password'
import { normalizeText } from '@/lib/text'
import { alertsFor, listSchema, type ShopRow } from './shops'

export function ShopsPage() {
  const { supabase } = useAuth()
  const toast = useToast()
  const [shops, setShops] = useState<ShopRow[] | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const load = useCallback(async () => {
    const res = await apiCall(supabase, 'admin/list-shops', {}, listSchema)
    if (res.ok) setShops(res.data.shops)
    else toast.error(res.message)
  }, [supabase, toast])
  useEffect(() => {
    void load()
  }, [load])
  if (!shops) return <PageSkeleton />
  const rows = shops.filter(
    (s) =>
      (!status || s.status === status) &&
      (!q || normalizeText(s.name).includes(normalizeText(q)) || (s.owner_phone ?? '').includes(q)),
  )
  const alerts = shops.flatMap((s) => alertsFor(s).map((a) => ({ shop: s, text: a })))
  return (
    <div className="space-y-4">
      <PageHeader
        title="Boutiques"
        hint={`${shops.length} boutique(s) · aperçu agrégé (pas de détail des ventes)`}
        action={
          <Button
            onClick={() => {
              setCreating(true)
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Créer une boutique
          </Button>
        }
      />
      {alerts.length > 0 ? (
        <Card className="space-y-1 border-accent-500 bg-accent-50">
          <h2 className="text-lg font-bold">Alertes</h2>
          {alerts.map((a, i) => (
            <p key={i} className="text-base">
              <Link className="font-semibold underline" to={`/admin/boutiques/${a.shop.shop_id}`}>
                {a.shop.name}
              </Link>{' '}
              : {a.text}
            </p>
          ))}
        </Card>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Rechercher (nom, téléphone)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
          }}
        />
        <Select
          label="Statut"
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'Tous' },
            { value: 'active', label: 'Actives' },
            { value: 'blocked', label: 'Bloquées' },
          ]}
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-neutral-300 bg-white">
        <table className="w-full min-w-[720px] text-left text-base">
          <thead className="bg-neutral-100 text-sm">
            <tr>
              {[
                'Boutique',
                'Statut',
                'Dernière activité',
                'Ventes du jour',
                'En attente',
                'Version',
              ].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rows.map((s) => (
              <tr key={s.shop_id}>
                <td className="px-3 py-2">
                  <Link
                    className="font-semibold text-brand-800 underline"
                    to={`/admin/boutiques/${s.shop_id}`}
                  >
                    {s.name}
                  </Link>
                  <br />
                  <span className="text-sm text-neutral-700">{s.owner_phone ?? ''}</span>
                </td>
                <td className="px-3 py-2">
                  {s.status === 'blocked' ? (
                    <Badge tone="danger">Bloquée</Badge>
                  ) : (
                    <Badge tone="success">Active</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  {s.last_seen_at ? formatDateTime(s.last_seen_at) : 'jamais'}
                </td>
                <td className="px-3 py-2">
                  {formatMoney(s.sales_today)} ({s.sales_count_today})
                </td>
                <td className="px-3 py-2">{s.pending_count}</td>
                <td className="px-3 py-2">
                  {s.app_version ?? '-'}
                  {s.device_clock_skew_seconds !== null &&
                  Math.abs(s.device_clock_skew_seconds) > 600
                    ? ' ⚠ horloge'
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating ? (
        <CreateShop
          onClose={() => {
            setCreating(false)
            void load()
          }}
        />
      ) : null}
    </div>
  )
}

function CreateShop({ onClose }: { onClose: () => void }) {
  const { supabase } = useAuth()
  const toast = useToast()
  const [f, setF] = useState({
    shop_name: '',
    owner_name: '',
    phone: '',
    email: '',
    password: '',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ identifier: string; password: string } | null>(null)
  async function create() {
    setBusy(true)
    const body = {
      shop_name: f.shop_name,
      owner_name: f.owner_name,
      phone: f.phone,
      password: f.password,
      ...(f.email ? { email: f.email } : {}),
      ...(f.notes ? { notes: f.notes } : {}),
    }
    const res = await apiCall(
      supabase,
      'admin/create-shop',
      body,
      z.object({ shop_id: z.string(), identifier: z.string() }),
    )
    if (res.ok) setDone({ identifier: res.data.identifier, password: f.password })
    else toast.error(res.message)
    setBusy(false)
  }
  return (
    <Modal
      open
      title="Créer une boutique"
      onClose={onClose}
      footer={
        done ? (
          <Button onClick={onClose}>Terminé</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button loading={busy} onClick={() => void create()}>
              Créer
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3">
          <CredentialsCard
            identifier={done.identifier}
            password={done.password}
            appUrl={window.location.origin}
          />
          <p className="text-sm text-neutral-700">
            Le changement de mot de passe sera demandé à la première connexion.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Input
            label="Nom de la boutique"
            value={f.shop_name}
            onChange={(e) => {
              setF({ ...f, shop_name: e.target.value })
            }}
          />
          <Input
            label="Nom du propriétaire"
            value={f.owner_name}
            onChange={(e) => {
              setF({ ...f, owner_name: e.target.value })
            }}
          />
          <Input
            label="Téléphone (identifiant de connexion)"
            inputMode="tel"
            value={f.phone}
            onChange={(e) => {
              setF({ ...f, phone: e.target.value })
            }}
          />
          <Input
            label="Email technique (facultatif, sinon construit automatiquement)"
            value={f.email}
            onChange={(e) => {
              setF({ ...f, email: e.target.value })
            }}
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                label="Mot de passe temporaire"
                value={f.password}
                onChange={(e) => {
                  setF({ ...f, password: e.target.value })
                }}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setF({ ...f, password: generatePassword(14) })
              }}
            >
              Générer
            </Button>
          </div>
          <Input
            label="Notes internes"
            value={f.notes}
            onChange={(e) => {
              setF({ ...f, notes: e.target.value })
            }}
          />
        </div>
      )}
    </Modal>
  )
}
