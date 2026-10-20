import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'
import { PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Input } from '@/components/Input'
import { useToast } from '@/components/toast/useToast'
import { useAuth } from '@/auth/context'
import { apiCall } from '@/lib/api'
import { formatDateTime } from '@/lib/dates'

const schema = z.object({
  entries: z.array(
    z.object({
      seq: z.number(),
      admin_user_id: z.string().nullable(),
      shop_id: z.string().nullable(),
      action: z.string(),
      details: z.unknown(),
      reason: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
})

export function AuditPage() {
  const { supabase } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<z.infer<typeof schema>['entries'] | null>(null)
  const [action, setAction] = useState('')
  const load = useCallback(async () => {
    const res = await apiCall(supabase, 'admin/audit-log', action ? { action } : {}, schema)
    if (res.ok) setRows(res.data.entries)
    else toast.error(res.message)
  }, [supabase, action, toast])
  useEffect(() => {
    void load()
  }, [load])
  if (!rows) return <PageSkeleton />
  return (
    <div className="space-y-4">
      <PageHeader
        title="Journal d’audit"
        hint="Toutes les actions d’administration, y compris chaque consultation détaillée. Le journal ne peut pas être modifié."
      />
      <Input
        label="Filtrer par action (ex. block_shop, view_shop_data)"
        value={action}
        onChange={(e) => {
          setAction(e.target.value)
        }}
      />
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
        {rows.map((r) => (
          <li key={r.seq} className="px-4 py-2 text-base">
            <b>{r.action}</b> · {formatDateTime(r.created_at)}
            <br />
            <span className="text-sm text-neutral-700">
              boutique …{r.shop_id?.slice(-4) ?? '—'} · par …{r.admin_user_id?.slice(-4) ?? '—'}
              {r.reason ? ` · motif : ${r.reason}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
