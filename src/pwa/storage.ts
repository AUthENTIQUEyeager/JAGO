/** Demande un stockage persistant (le navigateur évite alors de purger les données) et lit le quota. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist)
      return await navigator.storage.persist()
  } catch {
    /* non disponible : sans conséquence */
  }
  return false
}

export interface StorageInfo {
  persisted: boolean | null
  usageMb: number | null
  quotaMb: number | null
}

export async function readStorage(): Promise<StorageInfo> {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null
    const mb = (n: number | undefined) =>
      n === undefined ? null : Math.round((n / 1_048_576) * 10) / 10
    return { persisted, usageMb: mb(est?.usage), quotaMb: mb(est?.quota) }
  } catch {
    return { persisted: null, usageMb: null, quotaMb: null }
  }
}

export const isIos = (): boolean =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
export const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true)
