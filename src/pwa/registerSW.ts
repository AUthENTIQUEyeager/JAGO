import { registerSW } from 'virtual:pwa-register'
import { markUpdateAvailable } from './updateStore'

/** Enregistre le Service Worker (fichier externe : aucun script inline, compatible avec la CSP). */
export function registerServiceWorker(): void {
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      markUpdateAvailable(() => update(true))
    },
  })
}
