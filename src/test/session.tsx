import 'fake-indexeddb/auto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { AuthContext, type AuthApi } from '@/auth/context'
import { platformSchema, type ReadySession } from '@/auth/types'
import { ToastProvider } from '@/components/toast/ToastProvider'
import type { Ctx } from '@/db/ctx'
import { JagoDb } from '@/db/dexie'
import { ensureDeviceIdentity } from '@/db/meta'
import type { Role } from '@/db/schemas'
import { parseSettings } from '@/db/settings'

export const SHOP = '10000000-0000-4000-8000-00000000000a'
export const USER = '00000000-0000-4000-8000-0000000000a1'
let n = 0

/** Session « prête » factice, avec une vraie base Dexie (fake-indexeddb). */
export async function makeSession(
  role: Role = 'owner',
  settings: unknown = {},
): Promise<ReadySession> {
  const db = new JagoDb(`ui-${++n}-${Math.random()}`)
  const { deviceId, deviceShort } = await ensureDeviceIdentity(db)
  const ctx: Ctx = { db, shopId: SHOP, userId: USER, role, deviceId, deviceShort }
  return {
    status: 'ready',
    userId: USER,
    email: 'x@t.app',
    offline: false,
    db,
    ctx,
    profile: {
      shop_id: SHOP,
      role,
      full_name: 'Test',
      phone: '+22670123456',
      is_active: true,
      must_change_password: false,
      terms_version: '1',
    },
    shop: { id: SHOP, name: 'Chez Test', status: 'active' },
    settings: parseSettings(settings),
    platform: platformSchema.parse({}),
  }
}

export function renderWithSession(ui: ReactElement, session: ReadySession, path = '/') {
  const api: AuthApi = {
    state: session,
    supabase: { auth: {}, rpc: vi.fn(), from: vi.fn() } as unknown as SupabaseClient,
    env: {
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'k'.repeat(30),
      authEmailDomain: 'shops.test',
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
          {ui}
        </MemoryRouter>
      </AuthContext.Provider>
    </ToastProvider>,
  )
}
