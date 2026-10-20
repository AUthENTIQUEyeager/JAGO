import { Lock } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { z } from 'zod'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { PageSkeleton } from '@/components/PageSkeleton'
import { getMeta, setMeta } from '@/db/meta'
import { useAuth, useSession } from './context'
import { LockContext, type LockApi } from './lock-context'
import {
  createPinRecord,
  MAX_PIN_FAILURES,
  pinLockoutSeconds,
  verifyPin,
  type PinRecord,
} from './pin'

const pinSchema = z.object({ salt: z.string(), hash: z.string(), iterations: z.number() })
const attemptsSchema = z.object({ failures: z.number(), lockedUntil: z.number() })

/** Verrou PIN : à l'ouverture, après inactivité et après un long passage en arrière-plan. */
export function LockProvider({ children }: { children: ReactNode }) {
  const { db, userId, settings } = useSession()
  const { signOut } = useAuth()
  const [pin, setPinRecord] = useState<PinRecord | null | undefined>(undefined)
  const [locked, setLocked] = useState(true)
  const hiddenAt = useRef<number | null>(null)
  const idleMs = settings.idle_minutes * 60_000

  useEffect(() => {
    void getMeta(db, `pin:${userId}`, pinSchema).then((record) => {
      setPinRecord(record ?? null)
      setLocked(record !== undefined)
    })
  }, [db, userId])

  useEffect(() => {
    if (!pin) return
    let timer = setTimeout(() => {
      setLocked(true)
    }, idleMs)
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setLocked(true)
      }, idleMs)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now()
      else if (hiddenAt.current !== null && Date.now() - hiddenAt.current > idleMs) setLocked(true)
    }
    const events = ['pointerdown', 'keydown', 'touchstart'] as const
    events.forEach((e) => {
      window.addEventListener(e, reset, { passive: true })
    })
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearTimeout(timer)
      events.forEach((e) => {
        window.removeEventListener(e, reset)
      })
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pin, idleMs])

  const setPin = useCallback(
    async (value: string) => {
      const record = await createPinRecord(value)
      await setMeta(db, `pin:${userId}`, record)
      await setMeta(db, `pin_attempts:${userId}`, { failures: 0, lockedUntil: 0 })
      setPinRecord(record)
    },
    [db, userId],
  )
  const removePin = useCallback(async () => {
    await db.meta.delete(`pin:${userId}`)
    setPinRecord(null)
    setLocked(false)
  }, [db, userId])
  const api = useMemo<LockApi>(
    () => ({
      hasPin: Boolean(pin),
      lockNow: () => {
        setLocked(true)
      },
      setPin,
      removePin,
    }),
    [pin, setPin, removePin],
  )

  if (pin === undefined) return <PageSkeleton />
  return (
    <LockContext.Provider value={api}>
      {pin && locked ? (
        <LockScreen
          record={pin}
          onUnlock={() => {
            setLocked(false)
          }}
          onGiveUp={() => void signOut()}
        />
      ) : (
        children
      )}
    </LockContext.Provider>
  )
}

function LockScreen({
  record,
  onUnlock,
  onGiveUp,
}: {
  record: PinRecord
  onUnlock: () => void
  onGiveUp: () => void
}) {
  const { db, userId } = useSession()
  const [value, setValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    const key = `pin_attempts:${userId}`
    const state = (await getMeta(db, key, attemptsSchema)) ?? { failures: 0, lockedUntil: 0 }
    if (state.lockedUntil > Date.now()) {
      setMessage(
        `Trop d’essais. Patientez ${Math.ceil((state.lockedUntil - Date.now()) / 1000)} secondes.`,
      )
    } else if (await verifyPin(value, record)) {
      await setMeta(db, key, { failures: 0, lockedUntil: 0 })
      return onUnlock()
    } else {
      const failures = state.failures + 1
      await setMeta(db, key, {
        failures,
        lockedUntil: Date.now() + pinLockoutSeconds(failures) * 1000,
      })
      // Au-delà de 10 échecs : retour à la connexion par mot de passe. L'outbox est conservée.
      if (failures >= MAX_PIN_FAILURES) return onGiveUp()
      setMessage('Code incorrect.')
    }
    setValue('')
    setBusy(false)
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 p-6">
      <Lock className="h-10 w-10 text-brand-700" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-neutral-900">Application verrouillée</h1>
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Input
          label="Votre code"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, ''))
          }}
          error={message ?? undefined}
        />
        <Button type="submit" size="lg" fullWidth loading={busy} disabled={value.length < 4}>
          Déverrouiller
        </Button>
      </form>
      <Button variant="ghost" onClick={onGiveUp}>
        Code oublié : me reconnecter avec mon mot de passe
      </Button>
    </div>
  )
}
