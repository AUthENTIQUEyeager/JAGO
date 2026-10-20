import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { PageHeader, Card } from '@/components/PageHeader'
import { useToast } from '@/components/toast/useToast'
import { useAuth } from '@/auth/context'
import { apiCall } from '@/lib/api'
import { useReauth } from './useReauth'

export function PlatformPage() {
  const { supabase } = useAuth()
  const toast = useToast()
  const { ask, dialog } = useReauth()
  const [f, setF] = useState({
    support_phone: '',
    support_whatsapp: '',
    terms_version: '1',
    terms_text: '',
    maintenance_message: '',
  })
  useEffect(() => {
    void supabase
      .from('platform_settings')
      .select('support_phone, support_whatsapp, terms_version, terms_text, maintenance_message')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        const parsed = z
          .object({
            support_phone: z.string(),
            support_whatsapp: z.string(),
            terms_version: z.string(),
            terms_text: z.string(),
            maintenance_message: z.string().nullable(),
          })
          .safeParse(data)
        if (parsed.success)
          setF({ ...parsed.data, maintenance_message: parsed.data.maintenance_message ?? '' })
      })
  }, [supabase])
  async function save() {
    if (!(await ask())) return
    const res = await apiCall(
      supabase,
      'admin/update-settings',
      { ...f, maintenance_message: f.maintenance_message.trim() || null },
      z.object({ ok: z.literal(true) }),
    )
    if (res.ok) toast.success('Paramètres enregistrés.')
    else toast.error(res.message)
  }
  return (
    <div className="space-y-4">
      <PageHeader title="Paramètres de la plateforme" />
      <Card className="space-y-3">
        <Input
          label="Téléphone du support"
          inputMode="tel"
          value={f.support_phone}
          onChange={(e) => {
            setF({ ...f, support_phone: e.target.value })
          }}
        />
        <Input
          label="WhatsApp du support"
          inputMode="tel"
          value={f.support_whatsapp}
          onChange={(e) => {
            setF({ ...f, support_whatsapp: e.target.value })
          }}
        />
        <Input
          label="Version des conditions d’utilisation"
          value={f.terms_version}
          onChange={(e) => {
            setF({ ...f, terms_version: e.target.value })
          }}
          hint="Changer la version redemande l’acceptation à tous les utilisateurs."
        />
        <div className="space-y-1.5">
          <label htmlFor="terms" className="block text-base font-semibold">
            Texte des conditions
          </label>
          <textarea
            id="terms"
            rows={10}
            value={f.terms_text}
            onChange={(e) => {
              setF({ ...f, terms_text: e.target.value })
            }}
            className="w-full rounded-xl border border-neutral-400 p-3 text-base"
          />
        </div>
        <Input
          label="Message de maintenance (bandeau, facultatif)"
          value={f.maintenance_message}
          onChange={(e) => {
            setF({ ...f, maintenance_message: e.target.value })
          }}
        />
        <Button size="lg" onClick={() => void save()}>
          Enregistrer
        </Button>
      </Card>
      {dialog}
    </div>
  )
}
