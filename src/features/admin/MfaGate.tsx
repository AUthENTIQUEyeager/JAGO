import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { PageSkeleton } from '@/components/PageSkeleton'
import { useAuth } from '@/auth/context'

type Phase = 'loading' | 'ok' | 'verify' | 'enroll'

/** MFA TOTP obligatoire pour le super admin : sans niveau « aal2 », rien d'autre n'est affiché (et le serveur refuse tout). */
export function MfaGate({ children }: { children: ReactNode }) {
  const { supabase, signOut } = useAuth()
  const [phase, setPhase] = useState<Phase>('loading')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<{ svg: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const check = useCallback(async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (data?.currentLevel === 'aal2') return setPhase('ok')
    const factors = await supabase.auth.mfa.listFactors()
    const verified = factors.data?.totp.find((f) => f.status === 'verified')
    if (verified) {
      setFactorId(verified.id)
      return setPhase('verify')
    }
    // Aucun facteur : on supprime d'éventuels essais non terminés puis on en crée un.
    for (const f of factors.data?.all ?? [])
      if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const enroll = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (enroll.error) {
      setError('Impossible de préparer la vérification en deux étapes.')
      return setPhase('verify')
    }
    setFactorId(enroll.data.id)
    setQr({ svg: enroll.data.totp.qr_code, secret: enroll.data.totp.secret })
    setPhase('enroll')
  }, [supabase])
  useEffect(() => {
    void check()
  }, [check])

  async function verify() {
    if (!factorId) return
    setBusy(true)
    const res = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    setBusy(false)
    if (res.error) setError('Code incorrect.')
    else await check()
  }
  if (phase === 'loading')
    return (
      <div className="p-6">
        <PageSkeleton />
      </div>
    )
  if (phase === 'ok') return <>{children}</>
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Vérification en deux étapes</h1>
      {phase === 'enroll' && qr ? (
        <>
          <p className="text-base">
            Scannez ce code avec une application d’authentification (Google Authenticator, Aegis…),
            puis saisissez le code à 6 chiffres. Conservez vos codes de secours hors ligne.
          </p>
          <img
            src={qr.svg}
            alt="Code QR de configuration"
            className="mx-auto h-48 w-48 rounded-xl bg-white p-2"
          />
          <p className="break-all text-center font-mono text-sm">Clé manuelle : {qr.secret}</p>
        </>
      ) : (
        <p className="text-base">
          Saisissez le code à 6 chiffres de votre application d’authentification.
        </p>
      )}
      <Input
        label="Code à 6 chiffres"
        inputMode="numeric"
        maxLength={6}
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ''))
        }}
        error={error ?? undefined}
      />
      <Button size="lg" loading={busy} disabled={code.length !== 6} onClick={() => void verify()}>
        Valider
      </Button>
      <Button variant="ghost" onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </div>
  )
}
