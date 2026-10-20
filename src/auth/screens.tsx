import { Eye, EyeOff, Phone, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { brand } from '@/config/brand'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { buttonStyles } from '@/components/button-styles'
import { useToast } from '@/components/toast/useToast'
import { phoneDigits } from '@/lib/phone'
import { passwordStrength, validatePassword } from '@/lib/password'
import { cn } from '@/lib/cn'
import { useSyncEngine, useSyncStatus } from '@/sync/context'
import { useAuth, useSession } from './context'

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6">
      <div>
        <p className="text-3xl font-bold text-brand-800">{brand.name}</p>
        <h1 className="mt-2 text-2xl font-bold text-neutral-900">{title}</h1>
      </div>
      {children}
    </div>
  )
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  error?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input
        label={label}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
        error={error}
        className="pr-14"
      />
      <button
        type="button"
        aria-label={shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        onClick={() => {
          setShown(!shown)
        }}
        className="absolute right-1 top-[2.1rem] flex h-11 w-11 items-center justify-center text-neutral-700"
      >
        {shown ? (
          <EyeOff className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Eye className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}

export function LoginPage() {
  const { signIn, state, loginWait } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const notice = state.status === 'signedOut' ? state.notice : undefined

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(await signIn(identifier, password))
    setBusy(false)
  }
  return (
    <Frame title="Connexion">
      {notice ? (
        <p role="status" className="rounded-xl bg-brand-50 p-3 text-base text-brand-900">
          {notice}
        </p>
      ) : null}
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Input
          label="Identifiant (numéro de téléphone)"
          inputMode="tel"
          autoComplete="username"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value)
          }}
        />
        <PasswordInput
          label="Mot de passe"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        {error ? (
          <p role="alert" className="text-base font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        {loginWait() > 0 && error ? (
          <p className="text-sm text-neutral-700">
            Après plusieurs erreurs, une courte attente est demandée.
          </p>
        ) : null}
        <Button type="submit" size="lg" fullWidth loading={busy}>
          Se connecter
        </Button>
      </form>
      <p className="text-sm text-neutral-700">
        Pas encore de compte ? Votre fournisseur crée votre accès et vous remet vos identifiants.
      </p>
    </Frame>
  )
}

/** Première connexion (ou mot de passe réinitialisé) : changement obligatoire. */
export function ChangePasswordPage({ admin = false }: { admin?: boolean }) {
  const { supabase, refresh, state, signOut } = useAuth()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const forbidden =
    state.status === 'ready'
      ? [state.profile.phone ?? '', state.shop.name, state.email.split('@')[0] ?? '']
      : []
  const problem = pw ? validatePassword(pw, { minLength: admin ? 14 : 8, forbidden }) : null
  const mismatch = again && again !== pw ? 'Les deux mots de passe sont différents.' : undefined
  const strength = passwordStrength(pw)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!pw || problem || pw !== again) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) {
      toast.error('Impossible de changer le mot de passe. Vérifiez votre connexion internet.')
      return setBusy(false)
    }
    await supabase.rpc('complete_password_change')
    await refresh()
    toast.success('Mot de passe modifié.')
    setBusy(false)
  }
  return (
    <Frame title="Choisissez votre mot de passe">
      <p className="text-base text-neutral-800">
        C’est votre première connexion : choisissez un mot de passe que vous êtes le seul à
        connaître.
      </p>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <PasswordInput
          label="Nouveau mot de passe"
          value={pw}
          onChange={setPw}
          autoComplete="new-password"
          error={problem ?? undefined}
        />
        <div className="flex gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                'h-2 flex-1 rounded-full',
                strength >= i
                  ? strength >= 3
                    ? 'bg-brand-600'
                    : 'bg-accent-500'
                  : 'bg-neutral-300',
              )}
            />
          ))}
        </div>
        <PasswordInput
          label="Répétez le mot de passe"
          value={again}
          onChange={setAgain}
          autoComplete="new-password"
          error={mismatch}
        />
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={busy}
          disabled={!pw || problem !== null || pw !== again}
        >
          Enregistrer
        </Button>
      </form>
      <Button variant="ghost" onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </Frame>
  )
}

export function TermsPage() {
  const { supabase, refresh, signOut } = useAuth()
  const { platform, offline } = useSession()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  async function accept() {
    setBusy(true)
    const { error } = await supabase.rpc('accept_terms', { p_version: platform.terms_version })
    if (error) toast.error('Impossible d’enregistrer. Vérifiez votre connexion internet.')
    else await refresh()
    setBusy(false)
  }
  return (
    <Frame title="Conditions d’utilisation">
      <div className="max-h-[50dvh] overflow-y-auto rounded-xl border border-neutral-300 bg-white p-4 text-base leading-relaxed text-neutral-900">
        {platform.terms_text || 'Texte des conditions non renseigné.'}
      </div>
      {offline ? (
        <p className="text-base text-red-800">
          Une connexion internet est nécessaire pour accepter.
        </p>
      ) : null}
      <Button size="lg" fullWidth loading={busy} disabled={offline} onClick={() => void accept()}>
        J’ai lu et j’accepte
      </Button>
      <Button variant="ghost" onClick={() => void signOut()}>
        Je refuse (se déconnecter)
      </Button>
    </Frame>
  )
}

export function MessageScreen({
  title,
  body,
  children,
}: {
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <Frame title={title}>
      <p className="text-base text-neutral-800">{body}</p>
      {children}
    </Frame>
  )
}

export function DisabledScreen() {
  const { signOut } = useAuth()
  return (
    <MessageScreen
      title="Compte désactivé"
      body="Votre compte n’est pas actif. Contactez le propriétaire de la boutique ou votre fournisseur."
    >
      <Button variant="secondary" onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </MessageScreen>
  )
}

export function NeedsNetworkScreen() {
  const { refresh, signOut } = useAuth()
  return (
    <MessageScreen
      title="Connexion internet nécessaire"
      body="C’est la première fois que cet appareil ouvre ce compte : il doit se connecter à internet une fois pour télécharger vos données."
    >
      <Button onClick={() => void refresh()}>Réessayer</Button>
      <Button variant="ghost" onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </MessageScreen>
  )
}

/** Écran plein « Accès suspendu ». Les ventes locales sont conservées ; l'envoi reprend au déblocage. */
export function BlockedScreen() {
  const status = useSyncStatus()
  const engine = useSyncEngine()
  const { platform, shop } = useSession()
  const { signOut } = useAuth()
  const disabled = status.blockedReason === 'disabled'
  const phone = platform.support_phone
  const wa = phoneDigits(platform.support_whatsapp || platform.support_phone)
  const message = status.blockMessage ?? shop.block_message ?? null
  return (
    <Frame title={disabled ? 'Compte désactivé' : 'Accès suspendu'}>
      <div className="flex items-start gap-3 rounded-xl bg-red-50 p-4 text-red-900">
        <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        <p className="text-base">
          {disabled
            ? 'Votre compte a été désactivé.'
            : 'Votre accès a été suspendu par l’administrateur.'}
          {phone ? ` Veuillez le contacter au ${phone}.` : ' Veuillez le contacter.'}
        </p>
      </div>
      {message ? (
        <p className="rounded-xl bg-white p-4 text-base text-neutral-900">{message}</p>
      ) : null}
      <p className="text-base text-neutral-800">
        Vos ventes déjà enregistrées sont conservées sur cet appareil. Elles seront envoyées dès que
        l’accès sera rétabli.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {phone ? (
          <a className={buttonStyles({ variant: 'primary', size: 'lg' })} href={`tel:${phone}`}>
            <Phone className="h-5 w-5" aria-hidden="true" />
            Appeler
          </a>
        ) : null}
        {wa ? (
          <a
            className={buttonStyles({ variant: 'accent', size: 'lg' })}
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
        ) : null}
      </div>
      <Button
        variant="secondary"
        size="lg"
        loading={status.state === 'syncing'}
        onClick={() => void engine.syncNow()}
      >
        Réessayer
      </Button>
      <Button variant="ghost" onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </Frame>
  )
}
