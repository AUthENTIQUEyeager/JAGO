import { Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmptyState } from '@/components/EmptyState'
import { PageHeader, Card } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Select } from '@/components/Select'
import { useToast } from '@/components/toast/useToast'
import { useAuth } from '@/auth/context'
import { apiCall } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'
import { normalizePhone } from '@/lib/phone'
import { CreateShop, type CreateShopInitial } from './ShopsPage'
import {
  ACTIVITY_LABEL,
  notesFromSignup,
  signupListSchema,
  STATUS_LABEL,
  type SignupRow,
  type SignupStatus,
} from './signups'
import { useReauth } from './useReauth'

const TONE: Record<SignupStatus, 'warning' | 'neutral' | 'success' | 'danger'> = {
  new: 'warning',
  contacted: 'neutral',
  created: 'success',
  rejected: 'danger',
}
const ok = z.object({ ok: z.literal(true) })

/** Demandes d'inscription reçues depuis la page d'accueil publique. */
export function SignupsPage() {
  const { supabase } = useAuth()
  const toast = useToast()
  const { ask, dialog } = useReauth()
  const [rows, setRows] = useState<SignupRow[] | null>(null)
  const [filter, setFilter] = useState('new')
  const [creating, setCreating] = useState<CreateShopInitial | null>(null)
  const [deleting, setDeleting] = useState<SignupRow | null>(null)

  const load = useCallback(async () => {
    const res = await apiCall(supabase, 'admin/list-signups', {}, signupListSchema)
    if (res.ok) setRows(res.data.requests)
    else toast.error(res.message)
  }, [supabase, toast])
  useEffect(() => {
    void load()
  }, [load])

  async function setStatus(id: string, status: SignupStatus) {
    const res = await apiCall(supabase, 'admin/update-signup', { id, status }, ok)
    if (res.ok) await load()
    else toast.error(res.message)
  }
  async function saveNotes(id: string, admin_notes: string) {
    const res = await apiCall(supabase, 'admin/update-signup', { id, admin_notes }, ok)
    if (res.ok) toast.success('Note enregistrée.')
    else toast.error(res.message)
  }
  async function remove(row: SignupRow) {
    if (!(await ask())) return
    const res = await apiCall(supabase, 'admin/delete-signup', { id: row.id }, ok)
    if (res.ok) {
      toast.success('Demande supprimée.')
      setDeleting(null)
      await load()
    } else toast.error(res.message)
  }

  if (!rows) return <PageSkeleton />
  const shown = rows.filter((r) => !filter || r.status === filter)
  const count = (s: SignupStatus) => rows.filter((r) => r.status === s).length
  return (
    <div className="space-y-4">
      <PageHeader
        title="Demandes d’inscription"
        hint={`${count('new')} nouvelle(s) · ${rows.length} au total`}
      />
      <Select
        label="Afficher"
        value={filter}
        onChange={setFilter}
        options={[
          { value: '', label: 'Toutes' },
          ...(Object.keys(STATUS_LABEL) as SignupStatus[]).map((s) => ({
            value: s,
            label: `${STATUS_LABEL[s]} (${count(s)})`,
          })),
        ]}
      />
      {shown.length === 0 ? (
        <EmptyState
          title="Aucune demande"
          description="Les demandes envoyées depuis la page d’accueil apparaissent ici."
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <li key={r.id}>
              <Card className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">{r.shop_name}</p>
                    <p className="text-base">
                      {r.full_name} ·{' '}
                      <a className="font-semibold text-brand-800 underline" href={`tel:${r.phone}`}>
                        {r.phone}
                      </a>
                    </p>
                  </div>
                  <Badge tone={TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <p className="text-sm text-neutral-700">
                  {ACTIVITY_LABEL[r.activity] ?? r.activity}
                  {r.city || r.country
                    ? ` · ${[r.city, r.country].filter(Boolean).join(', ')}`
                    : ''}
                  {r.email ? ` · ${r.email}` : ''} · reçue le {formatDateTime(r.created_at)}
                </p>
                {r.message ? (
                  <p className="whitespace-pre-wrap rounded-xl bg-neutral-100 p-3 text-base">
                    {r.message}
                  </p>
                ) : null}
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold">Note interne</span>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    defaultValue={r.admin_notes ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (r.admin_notes ?? ''))
                        void saveNotes(r.id, e.target.value)
                    }}
                    className="w-full rounded-xl border border-neutral-400 px-3 py-2 text-base"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {r.status !== 'created' ? (
                    <Button
                      onClick={() => {
                        setCreating({
                          shop_name: r.shop_name,
                          owner_name: r.full_name,
                          phone: normalizePhone(r.phone) ?? r.phone,
                          notes: notesFromSignup(r),
                          signup_id: r.id,
                        })
                      }}
                    >
                      <UserPlus className="h-5 w-5" aria-hidden="true" />
                      Créer le compte
                    </Button>
                  ) : null}
                  {r.status === 'new' ? (
                    <Button variant="secondary" onClick={() => void setStatus(r.id, 'contacted')}>
                      Marquer contactée
                    </Button>
                  ) : null}
                  {r.status !== 'rejected' && r.status !== 'created' ? (
                    <Button variant="secondary" onClick={() => void setStatus(r.id, 'rejected')}>
                      Refuser
                    </Button>
                  ) : null}
                  {r.status !== 'new' ? (
                    <Button variant="ghost" onClick={() => void setStatus(r.id, 'new')}>
                      Remettre en nouvelle
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    aria-label={`Supprimer la demande de ${r.shop_name}`}
                    onClick={() => {
                      setDeleting(r)
                    }}
                  >
                    <Trash2 className="h-5 w-5 text-red-700" aria-hidden="true" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {creating ? (
        <CreateShop
          initial={creating}
          onClose={() => {
            setCreating(null)
            void load()
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmDialog
          open
          title="Supprimer cette demande ?"
          message={`La demande de ${deleting.shop_name} sera effacée définitivement (données personnelles comprises).`}
          confirmLabel="Supprimer"
          tone="danger"
          onConfirm={() => void remove(deleting)}
          onCancel={() => {
            setDeleting(null)
          }}
        />
      ) : null}
      {dialog}
    </div>
  )
}
