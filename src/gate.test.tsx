import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthApi } from '@/auth/context'
import { ToastProvider } from '@/components/toast/ToastProvider'
import { Gate } from './Gate'

const media = (matches: boolean) =>
  vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })
beforeEach(() => {
  vi.stubGlobal('matchMedia', media(false))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderSignedOut(path: string) {
  const api: AuthApi = {
    state: { status: 'signedOut' },
    supabase: { auth: {} } as unknown as SupabaseClient,
    env: {
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'k'.repeat(30),
      authEmailDomain: 't.app',
    },
    signIn: () => Promise.resolve(null),
    signOut: () => Promise.resolve(),
    wipeLocalData: () => Promise.resolve(null),
    refresh: () => Promise.resolve(),
    loginWait: () => 0,
  }
  return render(
    <ToastProvider>
      <AuthContext.Provider value={api}>
        <MemoryRouter
          initialEntries={[path]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Gate />
        </MemoryRouter>
      </AuthContext.Provider>
    </ToastProvider>,
  )
}

describe('visiteur non connecté', () => {
  it('« / » affiche la page d’accueil, pas la connexion', async () => {
    renderSignedOut('/')
    expect(await screen.findByRole('heading', { name: 'Demandez votre compte' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Connexion' })).toBeNull()
  })

  it('« /connexion » et les autres liens affichent la connexion', async () => {
    for (const path of ['/connexion', '/ventes']) {
      const { unmount } = renderSignedOut(path)
      expect(await screen.findByRole('heading', { name: 'Connexion' }), path).toBeTruthy()
      unmount()
    }
  })

  it('l’application installée va directement à la connexion', async () => {
    vi.stubGlobal('matchMedia', media(true))
    renderSignedOut('/')
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeTruthy()
  })
})
