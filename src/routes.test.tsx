import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { navItems } from '@/config/navigation'
import { AppRoutes } from './routes'

function renderAt(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AppRoutes />
    </MemoryRouter>,
  )
}

describe('routes', () => {
  it('affiche la caisse à la racine', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Caisse' })).toBeTruthy()
  })

  it('chaque écran de la navigation a sa route', async () => {
    for (const item of navItems.filter((entry) => entry.id !== 'more' && entry.path !== '/')) {
      const { unmount } = renderAt(item.path)
      expect(await screen.findByRole('heading', { level: 1, name: item.label })).toBeTruthy()
      unmount()
    }
  })

  it('la page « Plus » liste les écrans secondaires', async () => {
    renderAt('/plus')
    expect(await screen.findByRole('heading', { level: 1, name: 'Plus' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Paramètres' }).length).toBeGreaterThan(0)
  })

  it('affiche une page 404 claire pour une adresse inconnue', async () => {
    renderAt('/adresse-inconnue')
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Retour à la caisse' })).toBeTruthy()
  })

  it('la barre du bas contient les 5 écrans principaux', () => {
    renderAt('/')
    const labels = ['Caisse', 'Produits', 'Stock', 'Clients', 'Plus']
    for (const label of labels) {
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
    }
  })
})
