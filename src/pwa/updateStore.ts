/** État de mise à jour du Service Worker. L'activation se fait au clic, jamais en pleine vente. */
let needRefresh = false
let apply: (() => Promise<void>) | null = null
const listeners = new Set<() => void>()
export const markUpdateAvailable = (fn: () => Promise<void>): void => {
  needRefresh = true
  apply = fn
  listeners.forEach((l) => l())
}
export const subscribeUpdate = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getNeedRefresh = (): boolean => needRefresh
export const applyUpdate = async (): Promise<void> => {
  await apply?.()
}
