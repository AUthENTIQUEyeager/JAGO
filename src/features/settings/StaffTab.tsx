import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { CredentialsCard } from '@/components/CredentialsCard'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { useToast } from '@/components/toast/useToast'
import { useAuth } from '@/auth/context'
import { apiCall } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'

const staffSchema = z.object({
  staff: z.array(
    z.object({
      user_id: z.string(),
      full_name: z.string(),
      role: z.string(),
      phone: z.string().nullable(),
      is_active: z.boolean(),
      last_seen_at: z.string().nullable(),
    }),
  ),
})
const credSchema = z.object({ identifier: z.string(), password: z.string() })
const okSchema = z.object({ ok: z.literal(true) })

export function StaffTab() {
  const { supabase } = useAuth()
  const toast = useToast()
  const [staff, setStaff] = useState<z.infer<typeof staffSchema>['staff'] | null>(null)
  const [creds, setCreds] = useState<{ identifier: string; password: string } | null>(null)
  const [f, setF] = useState({ full_name: '', phone: '', role: 'cashier' })
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const res = await apiCall(supabase, 'shop/list-staff', {}, staffSchema)
    if (res.ok) setStaff(res.data.staff)
    else toast.error(res.message)
  }, [supabase, toast])
  useEffect(() => {
    void load()
  }, [load])

  async function create() {
    setBusy(true)
    const res = await apiCall(supabase, 'shop/create-staff', f, credSchema)
    if (res.ok) {
      setCreds(res.data)
      setF({ full_name: '', phone: '', role: 'cashier' })
      await load()
    } else toast.error(res.message)
    setBusy(false)
  }
  async function toggle(userId: string, active: boolean) {
    const res = await apiCall(
      supabase,
      'shop/set-staff-active',
      { user_id: userId, active },
      okSchema,
    )
    if (res.ok) {
      toast.success(active ? 'Compte réactivé.' : 'Compte désactivé : il est refusé immédiatement.')
      await load()
    } else toast.error(res.message)
  }
  async function reset(userId: string) {
    const res = await apiCall(
      supabase,
      'shop/reset-staff-password',
      { user_id: userId },
      credSchema,
    )
    if (res.ok) setCreds(res.data)
    else toast.error(res.message)
  }
  return (
    <div className="space-y-4">
      {creds ? (
        <CredentialsCard
          identifier={creds.identifier}
          password={creds.password}
          appUrl={window.location.origin}
        />
      ) : null}
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
        {(staff ?? []).map((s) => (
          <li key={s.user_id} className="space-y-2 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="block text-base font-semibold">{s.full_name}</span>
                <span className="text-sm text-neutral-700">
                  {s.role === 'owner'
                    ? 'Propriétaire'
                    : s.role === 'manager'
                      ? 'Gérant'
                      : 'Caissier'}{' '}
                  · {s.phone ?? ''}
                  {s.last_seen_at
                    ? ` · vu le ${formatDateTime(s.last_seen_at)}`
                    : ' · jamais connecté'}
                </span>
              </span>
              {s.is_active ? (
                <Badge tone="success">Actif</Badge>
              ) : (
                <Badge tone="danger">Désactivé</Badge>
              )}
            </div>
            {s.role !== 'owner' ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => void toggle(s.user_id, !s.is_active)}>
                  {s.is_active ? 'Désactiver' : 'Réactiver'}
                </Button>
                <Button variant="secondary" onClick={() => void reset(s.user_id)}>
                  Nouveau mot de passe
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="space-y-3 rounded-2xl border border-neutral-300 bg-white p-4">
        <h2 className="text-lg font-bold">Ajouter une personne</h2>
        <Input
          label="Nom"
          value={f.full_name}
          onChange={(e) => {
            setF({ ...f, full_name: e.target.value })
          }}
        />
        <Input
          label="Téléphone (sert d’identifiant)"
          inputMode="tel"
          value={f.phone}
          onChange={(e) => {
            setF({ ...f, phone: e.target.value })
          }}
        />
        <Select
          label="Rôle"
          value={f.role}
          onChange={(v) => {
            setF({ ...f, role: v })
          }}
          options={[
            { value: 'cashier', label: 'Caissier' },
            { value: 'manager', label: 'Gérant' },
          ]}
        />
        <Button loading={busy} onClick={() => void create()}>
          Créer le compte
        </Button>
      </div>
    </div>
  )
}
