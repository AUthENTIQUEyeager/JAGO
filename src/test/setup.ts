import { afterEach } from 'vitest'

// Les tests « node » (sans DOM) n’ont pas besoin du nettoyage React.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
  })
}
