import { createContext, useContext } from 'react'

export interface LockApi {
  hasPin: boolean
  lockNow: () => void
  setPin: (pin: string) => Promise<void>
  removePin: () => Promise<void>
}
export const LockContext = createContext<LockApi | null>(null)

export function useLock(): LockApi {
  const api = useContext(LockContext)
  if (!api) throw new Error('useLock doit être utilisé dans <LockProvider>.')
  return api
}
