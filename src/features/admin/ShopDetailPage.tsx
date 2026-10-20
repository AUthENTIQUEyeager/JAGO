import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CredentialsCard } from '@/components/CredentialsCard'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { PageHeader, Card, Stat } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useToast } from '@/components/toast/useToast'
import { useAuth } from '@/auth/context'
import { apiCall } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { formatMoney } from '@/lib/money'
import { useReauth } from './useReauth'

const detailSchema = z.object({
  shop: z.object({
    id: z.string(),
    name: z.string(),
    owner_phone: z.string().nullable(),
    status: z.string(),
    blocked_reason: z.string().nullable(),
    block_message: z.string().nullable(),
    notes_admin: z.string().nullable(),
    last_seen_at: z.string().nullable(),
    pending_count: z.number(),
    app_version: z.string().nullable(),
  }),
  stats: z.object({
    revenue_30d: z.coerce.number(),
    sales_count_30d: z.coerce.number(),
    last_sale_at: z.string().nullable(),
    staff_count: z.coerce.number(),
    anomalies_count: z.coerce.number(),
  }),
  staff: z.array(
    z.object({
      user_id: z.string(),
      full_name: z.string(),
      role: z.string(),
      is_active: z.boolean(),
      last_seen_at: z.string().nullable(),
    }),
  ),
})
const salesSchema = z.object({
  sales: z.array(
    z.object({
      id: z.string(),
      receipt_no: z.string(),
      created_at: z.string(),
      total: z.coerce.number(),
      status: z.string(),
    }),
  ),
})
const okSchema = z.object({ status: z.string() }).or(z.object({ ok: z.literal(true) }))
const credSchema = z.object({ identifier: z.string(), password: z.string() })

export function ShopDetailPage() {
  const { id = '' } = useParams()
  const { supabase } = useAuth()
  const toast = useToast()
  const { ask, dialog } = useReauth()
  const [data, setData] = useState<z.infer<typeof detailSchema> | null>(null)
  const [blocking, setBlocking] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [notes, setNotes] = useState('')
  const [creds, setCreds] = useState<z.infer<typeof credSchema> | null>(null)
  const [viewReason, setViewReason] = useState<string | null>(null)
  const [sales, setSales] = useState<z.infer<typeof salesSchema>['sales'] | null>(null)

  const load = useCallback(async () => {
    const res = await apiCall(supabase, 'admin/shop-detail', { shop_id: id }, detailSchema)
    if (res.ok) {
      setData(res.data)
      setNotes(res.data.shop.notes_admin ?? '')
    } else toast.error(res.message)
  }, [supabase, id, toast])
  useEffect(() => {
    void load()
  }, [load])
  if (!data) return <PageSkeleton />
  const { shop, stats, staff } = data
  const blocked = shop.status === 'blocked'

  async function sensitive<T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
  ): Promise<T | null> {
    if (!(await ask())) return null
    const res = await apiCall(supabase, path, body, schema)
    if (!res.ok) {
      toast.error(res.message)
      return null
    }
    return res.data
  }
  async function setStatus(status: 'active' | 'blocked') {
    const r = await sensitive(
      'admin/set-shop-status',
      {
        shop_id: id,
        status,
        ...(status === 'blocked' ? { reason, ...(message ? { message } : {}) } : {}),
      },
      okSchema,
    )
    if (r) {
      toast.success(status === 'blocked' ? 'Boutique bloquée.' : 'Boutique débloquée.')
      setBlocking(false)
      await load()
    }
  }
  return (
    <div className="space-y-4">
      <Link to="/admin" className="text-base font-semibold text-brand-800 underline">
        ← Toutes les boutiques
      </Link>
      <PageHeader
        title={shop.name}
        hint={`${shop.owner_phone ?? ''} · dernière activité : ${shop.last_seen_at ? formatDateTime(shop.last_seen_at) : 'jamais'}`}
        action={
          blocked ? <Badge tone="danger">Bloquée</Badge> : <Badge tone="success">Active</Badge>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Chiffre d’affaires (30 j)" value={formatMoney(stats.revenue_30d)} />
        <Stat label="Ventes (30 j)" value={String(stats.sales_count_30d)} />
        <Stat label="En attente de synchro" value={String(shop.pending_count)} />
        <Stat
          label="Anomalies détectées"
          value={String(stats.anomalies_count)}
          tone={stats.anomalies_count ? 'bad' : 'default'}
        />
      </div>
      {blocked ? (
        <Card>
          <p className="text-base">
            <b>Motif interne :</b> {shop.blocked_reason}
          </p>
          <p className="text-base">
            <b>Message affiché :</b> {shop.block_message ?? '—'}
          </p>
        </Card>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {blocked ? (
          <Button onClick={() => void setStatus('active')}>Débloquer</Button>
        ) : (
          <Button
            variant="danger"
            onClick={() => {
              setBlocking(true)
            }}
          >
            Bloquer
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() =>
            void sensitive('admin/reset-password', { shop_id: id }, credSchema).then((c) => {
              if (c) setCreds(c)
            })
          }
        >
          Réinitialiser le mot de passe du propriétaire
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setViewReason('')
          }}
        >
          Consulter les ventes (détail)
        </Button>
      </div>
      {creds ? (
        <CredentialsCard
          identifier={creds.identifier}
          password={creds.password}
          appUrl={window.location.origin}
        />
      ) : null}
      <Card>
        <h2 className="mb-2 text-lg font-bold">Personnel</h2>
        <ul className="divide-y divide-neutral-200 text-base">
          {staff.map((s) => (
            <li key={s.user_id} className="flex justify-between py-2">
              <span>
                {s.full_name} · {s.role}
              </span>
              {s.is_active ? (
                <Badge tone="success">Actif</Badge>
              ) : (
                <Badge tone="danger">Désactivé</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="space-y-2">
        <h2 className="text-lg font-bold">Notes internes</h2>
        <Input
          label="Notes (visibles par l’administrateur seulement)"
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value)
          }}
        />
        <Button
          variant="secondary"
          onClick={() =>
            void apiCall(
              supabase,
              'admin/update-shop-notes',
              { shop_id: id, notes },
              z.object({ ok: z.literal(true) }),
            ).then((r) => {
              if (r.ok) toast.success('Notes enregistrées.')
              else toast.error(r.message)
            })
          }
        >
          Enregistrer les notes
        </Button>
      </Card>

      <Modal
        open={blocking}
        title="Bloquer cette boutique"
        onClose={() => {
          setBlocking(false)
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setBlocking(false)
              }}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={!reason.trim()}
              onClick={() => void setStatus('blocked')}
            >
              Bloquer
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Motif interne (obligatoire)"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
            }}
          />
          <Input
            label="Message affiché au commerçant (facultatif)"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
            }}
          />
          <p className="text-sm text-neutral-700">
            Les ventes déjà faites hors ligne sont conservées et seront envoyées au déblocage.
          </p>
        </div>
      </Modal>
      <Modal
        open={viewReason !== null}
        title="Consulter le détail des ventes"
        onClose={() => {
          setViewReason(null)
          setSales(null)
        }}
        footer={
          <Button
            disabled={(viewReason ?? '').trim().length < 5 || sales !== null}
            onClick={() =>
              void sensitive(
                'admin/view-shop-data',
                { shop_id: id, reason: viewReason },
                salesSchema,
              ).then((r) => {
                if (r) setSales(r.sales)
              })
            }
          >
            Consulter
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-700">
            Cet accès est enregistré dans le journal d’audit, avec votre motif.
          </p>
          <Input
            label="Motif (obligatoire)"
            value={viewReason ?? ''}
            onChange={(e) => {
              setViewReason(e.target.value)
            }}
          />
          {sales ? (
            <ul className="divide-y divide-neutral-200 text-base">
              {sales.map((s) => (
                <li key={s.id} className="flex justify-between py-1.5">
                  <span>
                    {s.receipt_no} · {formatDateTime(s.created_at)}
                  </span>
                  <b>
                    {formatMoney(s.total)}
                    {s.status === 'voided' ? ' (annulée)' : ''}
                  </b>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Modal>
      {dialog}
    </div>
  )
}
