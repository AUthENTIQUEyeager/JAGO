import type { JagoDb } from '@/db/dexie'
import type { SyncEngine } from './engine'

/**
 * Déclencheurs : démarrage, 1 s après chaque écriture locale, retour du réseau, retour au premier plan,
 * minuterie de 30 s. `navigator.onLine` n'est qu'un indice : le résultat réel des requêtes fait foi.
 */
export function startSyncTriggers(engine: SyncEngine, db: JagoDb): () => void {
  let debounce: ReturnType<typeof setTimeout> | null = null
  const run = () => void engine.syncNow()
  const soon = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(run, 1000)
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') run()
  }
  const interval = setInterval(() => {
    if (navigator.onLine !== false) run()
  }, 30_000)
  const onCreating = () => soon()
  db.outbox.hook('creating', onCreating)
  window.addEventListener('online', run)
  document.addEventListener('visibilitychange', onVisible)
  run()
  return () => {
    clearInterval(interval)
    if (debounce) clearTimeout(debounce)
    db.outbox.hook('creating').unsubscribe(onCreating)
    window.removeEventListener('online', run)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
