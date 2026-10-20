import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { navItems } from '@/config/navigation'
import { saveProduct } from '@/db/repositories/products'
import { makeSession, renderWithSession } from '@/test/session'
import { AppRoutes } from './routes'

vi.mock('@/features/dashboard/SalesChart', () => ({ default: () => null }))

describe('écrans (propriétaire)', () => {
  it('chaque écran de la navigation s’affiche avec son titre', async () => {
    for (const item of navItems) {
      const session = await makeSession('owner')
      const { unmount } = renderWithSession(<AppRoutes />, session, item.path)
      expect(
        await screen.findByRole('heading', { level: 1, name: item.label }),
        item.label,
      ).toBeTruthy()
      unmount()
    }
  })

  it('affiche une page 404 claire pour une adresse inconnue', async () => {
    renderWithSession(<AppRoutes />, await makeSession(), '/adresse-inconnue')
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Retour à la caisse' })).toBeTruthy()
  })

  it('la barre du bas contient les 5 écrans principaux', async () => {
    renderWithSession(<AppRoutes />, await makeSession(), '/')
    for (const label of ['Caisse', 'Produits', 'Stock', 'Clients', 'Plus'])
      expect(screen.getAllByRole('link', { name: label }).length).toBeGreaterThan(0)
  })
})

describe('écrans (caissier)', () => {
  it('les écrans de gestion sont réservés et masqués du menu', async () => {
    for (const path of ['/rapports', '/depenses', '/controle', '/fournisseurs']) {
      const { unmount } = renderWithSession(<AppRoutes />, await makeSession('cashier'), path)
      expect(await screen.findByRole('heading', { name: 'Écran réservé' }), path).toBeTruthy()
      unmount()
    }
    renderWithSession(<AppRoutes />, await makeSession('cashier'), '/plus')
    await screen.findByRole('heading', { level: 1, name: 'Plus' })
    expect(screen.queryByRole('link', { name: 'Rapports' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Contrôle' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'Paramètres' }).length).toBeGreaterThan(0)
  })
})

describe('caisse : une vente complète par l’interface', () => {
  it('ajoute un produit, paie en espèces, enregistre la vente et met le stock à jour', async () => {
    const session = await makeSession('owner')
    await saveProduct(session.ctx, {
      name: 'Riz 25kg',
      sale_price: 12500,
      cost_price: 10000,
      opening_qty: 10,
    })
    renderWithSession(<AppRoutes />, session, '/')
    fireEvent.click(await screen.findByRole('button', { name: /Riz 25kg/ }))
    expect((await screen.findAllByText(/12\s?500 FCFA/)).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Payer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Tout en espèces' }))
    fireEvent.click(screen.getByRole('button', { name: 'Valider la vente' }))
    expect(await screen.findByText(/Vente enregistrée/)).toBeTruthy()
    await waitFor(async () => {
      expect(await session.db.sales.count()).toBe(1)
    })
    const sale = (await session.db.sales.toArray())[0]
    expect(sale).toMatchObject({ total: 12500, paid_total: 12500, credit_amount: 0 })
    expect((await session.db.stock_cache.toArray())[0]?.qty).toBe(9)
    expect(await session.db.outbox.where('table').equals('sales').count()).toBe(1)
  })

  it('refuse de valider un crédit sans client', async () => {
    const session = await makeSession('owner')
    await saveProduct(session.ctx, { name: 'Sucre', sale_price: 1000, opening_qty: 5 })
    renderWithSession(<AppRoutes />, session, '/')
    fireEvent.click(await screen.findByRole('button', { name: /Sucre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Payer' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Choisissez un client')
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Valider la vente' }).disabled,
    ).toBe(true)
    expect(await session.db.sales.count()).toBe(0)
  })
})
