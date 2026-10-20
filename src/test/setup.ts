import { afterEach } from 'vitest'

// Les tests « node » (sans DOM) n’ont pas besoin du nettoyage React.
if (typeof document !== 'undefined') {
  await import('fake-indexeddb/auto') // IndexedDB simulée avant tout import de Dexie
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
  })
}
