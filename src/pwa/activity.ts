/** Indique qu'une vente est en cours (panier ouvert) : la mise à jour de l'application attend. */
let busy = false
const listeners = new Set<() => void>()
export const setSaleInProgress = (value: boolean): void => {
  if (busy === value) return
  busy = value
  listeners.forEach((l) => l())
}
export const subscribeActivity = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getSaleInProgress = (): boolean => busy
