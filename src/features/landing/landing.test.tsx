import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LandingPage from './LandingPage'
import { validateSignup } from './signup'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  )

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('page d’accueil', () => {
  it('explique les avantages et propose connexion et inscription', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Pourquoi choisir/ })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Se connecter/ })[0]?.getAttribute('href')).toBe(
      '/connexion',
    )
    expect(screen.getByRole('heading', { name: 'Demandez votre compte' })).toBeTruthy()
  })

  it('refuse un formulaire incomplet sans rien envoyer', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer ma demande' }))
    expect(screen.getByText('Indiquez votre nom.')).toBeTruthy()
    expect(screen.getByText(/Numéro invalide/)).toBeTruthy()
    expect(screen.getByText(/accepter d’être contacté/)).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('envoie la demande (sans jeton) avec le champ piège vide, puis remercie', async () => {
    fetchMock.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, data: { received: true } }),
    })
    renderPage()
    fill('Votre nom complet', 'Awa Traoré')
    fill('Nom de votre commerce', 'Boutique Awa')
    fill(/Téléphone/, '70 12 34 56')
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte d’être contacté/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer ma demande' }))
    await waitFor(() => {
      expect(screen.getByText(/votre demande est envoyée/)).toBeTruthy()
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/public/signup')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(JSON.parse(init.body as string)).toMatchObject({
      full_name: 'Awa Traoré',
      phone: '70 12 34 56',
      consent: true,
      website: '',
    })
  })

  it('affiche un message clair si le serveur limite les envois', async () => {
    fetchMock.mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: false,
          error: { code: 'rate_limited', message: 'Trop de demandes. Réessayez plus tard.' },
        }),
    })
    renderPage()
    fill('Votre nom complet', 'Awa Traoré')
    fill('Nom de votre commerce', 'Boutique Awa')
    fill(/Téléphone/, '70123456')
    fireEvent.click(screen.getByRole('checkbox', { name: /J’accepte d’être contacté/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer ma demande' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Trop de demandes. Réessayez plus tard.')).toBeTruthy()
  })
})

describe('validation du formulaire', () => {
  const ok = {
    full_name: 'Awa',
    shop_name: 'Boutique',
    phone: '+226 70 12 34 56',
    email: '',
    country: 'Burkina Faso',
    city: '',
    activity: 'shop',
    message: '',
    consent: true,
    website: '',
  }
  it('accepte une demande correcte et refuse les erreurs', () => {
    expect(validateSignup(ok)).toEqual({})
    expect(validateSignup({ ...ok, phone: '12' }).phone).toBeTruthy()
    expect(validateSignup({ ...ok, email: 'x' }).email).toBeTruthy()
    expect(validateSignup({ ...ok, consent: false }).consent).toBeTruthy()
  })
})
