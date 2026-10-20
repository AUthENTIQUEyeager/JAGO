import { useCallback, useRef, useState } from 'react'
import { useToast } from '@/components/toast/useToast'
import { PermissionError, ValidationError } from '@/db/ctx'

/** Exécute une action (écriture locale…) : évite les doubles clics, affiche un message clair en cas d'erreur. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const run = useCallback(
    async (fn: () => Promise<void>, success?: string): Promise<boolean> => {
      if (lock.current) return false
      lock.current = true
      setBusy(true)
      try {
        await fn()
        if (success) toast.success(success)
        return true
      } catch (error) {
        const known = error instanceof ValidationError || error instanceof PermissionError
        toast.error(known ? error.message : 'Une erreur est survenue. Réessayez.')
        if (!known) console.error(error)
        return false
      } finally {
        lock.current = false
        setBusy(false)
      }
    },
    [toast],
  )
  return { run, busy }
}
