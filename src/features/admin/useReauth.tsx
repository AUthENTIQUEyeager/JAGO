import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { useAuth } from '@/auth/context'

/**
 * Ré-authentification avant une action sensible : le super admin saisit un code TOTP frais.
 * Le serveur vérifie que ce code date de moins de 5 minutes (revendication « amr » du jeton).
 */
export function useReauth(): { ask: () => Promise<boolean>; dialog: ReactNode } {
  const { supabase } = useAuth()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const ask = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve
        setCode('')
        setError(null)
        setOpen(true)
      }),
    [],
  )
  const finish = (ok: boolean) => {
    setOpen(false)
    resolver.current?.(ok)
    resolver.current = null
  }

  async function verify() {
    setBusy(true)
    const factors = await supabase.auth.mfa.listFactors()
    const factor = factors.data?.totp.find((f) => f.status === 'verified')
    if (!factor) {
      setError('Aucun facteur de vérification trouvé.')
      return setBusy(false)
    }
    const res = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
    setBusy(false)
    if (res.error) setError('Code incorrect.')
    else finish(true)
  }
  const dialog = (
    <Modal
      open={open}
      title="Confirmez avec votre code"
      onClose={() => {
        finish(false)
      }}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              finish(false)
            }}
          >
            Annuler
          </Button>
          <Button loading={busy} disabled={code.length !== 6} onClick={() => void verify()}>
            Confirmer
          </Button>
        </>
      }
    >
      <Input
        label="Code à 6 chiffres de votre application d’authentification"
        inputMode="numeric"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ''))
        }}
        error={error ?? undefined}
      />
    </Modal>
  )
  return { ask, dialog }
}
