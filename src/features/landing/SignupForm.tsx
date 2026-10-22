import { CheckCircle2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { z } from 'zod'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { publicCall } from '@/lib/api'
import { ACTIVITY_OPTIONS, COUNTRIES, EMPTY, validateSignup, type Errors } from './signup'

export function SignupForm() {
  const [f, setF] = useState(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => {
    setF((prev) => ({ ...prev, [key]: value }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const found = validateSignup(f)
    setErrors(found)
    setServerError(null)
    if (Object.keys(found).length > 0) return
    setBusy(true)
    const res = await publicCall(
      'public/signup',
      {
        full_name: f.full_name,
        shop_name: f.shop_name,
        phone: f.phone,
        ...(f.email.trim() ? { email: f.email.trim() } : {}),
        country: f.country,
        ...(f.city.trim() ? { city: f.city.trim() } : {}),
        activity: f.activity,
        ...(f.message.trim() ? { message: f.message.trim() } : {}),
        consent: true,
        website: f.website,
      },
      z.object({ received: z.literal(true) }),
    )
    setBusy(false)
    if (res.ok) setDone(true)
    else
      setServerError(
        res.code === 'invalid_input'
          ? 'Vérifiez les champs du formulaire puis réessayez.'
          : res.message,
      )
  }

  if (done)
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-8 text-center"
      >
        <CheckCircle2 className="h-12 w-12 text-brand-700" aria-hidden="true" />
        <h3 className="text-2xl font-bold text-brand-900">Merci, votre demande est envoyée</h3>
        <p className="text-base text-neutral-800">
          Nous vous contactons très vite au numéro indiqué pour créer votre compte.
        </p>
      </div>
    )

  return (
    <form
      onSubmit={(e) => void submit(e)}
      noValidate
      className="space-y-4 rounded-2xl border border-neutral-300 bg-white p-5 shadow-sm md:p-8"
    >
      <Input
        label="Votre nom complet"
        autoComplete="name"
        maxLength={120}
        value={f.full_name}
        onChange={(e) => {
          set('full_name', e.target.value)
        }}
        error={errors.full_name}
      />
      <Input
        label="Nom de votre commerce"
        maxLength={160}
        value={f.shop_name}
        onChange={(e) => {
          set('shop_name', e.target.value)
        }}
        error={errors.shop_name}
      />
      <Input
        label="Téléphone (WhatsApp de préférence)"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={24}
        value={f.phone}
        onChange={(e) => {
          set('phone', e.target.value)
        }}
        error={errors.phone}
      />
      <Input
        label="E-mail (facultatif)"
        type="email"
        autoComplete="email"
        maxLength={200}
        value={f.email}
        onChange={(e) => {
          set('email', e.target.value)
        }}
        error={errors.email}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Pays"
          value={f.country}
          onChange={(v) => {
            set('country', v)
          }}
          options={COUNTRIES.map((c) => ({ value: c, label: c }))}
        />
        <Input
          label="Ville (facultatif)"
          maxLength={100}
          value={f.city}
          onChange={(e) => {
            set('city', e.target.value)
          }}
        />
      </div>
      <Select
        label="Votre activité"
        value={f.activity}
        onChange={(v) => {
          set('activity', v)
        }}
        options={ACTIVITY_OPTIONS}
      />
      <div className="space-y-1.5">
        <label htmlFor="signup-message" className="block text-base font-semibold text-neutral-900">
          Un message (facultatif)
        </label>
        <textarea
          id="signup-message"
          rows={3}
          maxLength={1000}
          value={f.message}
          onChange={(e) => {
            set('message', e.target.value)
          }}
          className="w-full rounded-xl border border-neutral-400 bg-white px-4 py-3 text-base"
        />
      </div>
      {/* Champ piège : une personne ne le voit pas, un robot le remplit. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Ne pas remplir
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={f.website}
            onChange={(e) => {
              set('website', e.target.value)
            }}
          />
        </label>
      </div>
      <div className="space-y-1">
        <label className="flex items-start gap-3 text-base">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0"
            checked={f.consent}
            onChange={(e) => {
              set('consent', e.target.checked)
            }}
          />
          J’accepte d’être contacté au sujet de ma demande. Mes informations ne servent qu’à créer
          mon compte et ne sont jamais revendues.
        </label>
        {errors.consent ? (
          <p role="alert" className="text-sm font-semibold text-red-700">
            {errors.consent}
          </p>
        ) : null}
      </div>
      {serverError ? (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-base font-semibold text-red-800">
          {serverError}
        </p>
      ) : null}
      <Button type="submit" size="lg" fullWidth loading={busy}>
        Envoyer ma demande
      </Button>
    </form>
  )
}
