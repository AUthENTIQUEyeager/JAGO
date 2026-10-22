import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import {
  ChangePasswordPage,
  BlockedScreen,
  DisabledScreen,
  LoginPage,
  NeedsNetworkScreen,
  TermsPage,
} from '@/auth/screens'
import { useAuth, useSession } from '@/auth/context'
import { LockProvider } from '@/auth/LockProvider'
import { PageSkeleton } from '@/components/PageSkeleton'
import { requestPersistence } from '@/pwa/storage'
import { useSyncStatus } from '@/sync/context'
import { SyncProvider } from '@/sync/SyncProvider'
import { useEffect, type ReactNode } from 'react'
import { applyTheme } from '@/config/applyTheme'
import { AppRoutes } from './routes'

const AdminApp = lazy(() => import('@/features/admin/AdminApp'))

function BlockGate({ children }: { children: ReactNode }) {
  const session = useSession()
  const sync = useSyncStatus()
  const blocked =
    sync.state === 'blocked' || (session.shop.status === 'blocked' && sync.state !== 'idle')
  return blocked ? <BlockedScreen /> : <>{children}</>
}

function ReadyApp() {
  const session = useSession()
  useEffect(() => {
    void requestPersistence()
  }, [])
  const theme = session.settings.theme
  useEffect(() => {
    applyTheme(theme)
    return () => {
      applyTheme(null)
    }
  }, [theme])
  if (session.profile.must_change_password)
    return session.offline ? <NeedsNetworkScreen /> : <ChangePasswordPage />
  if (session.profile.terms_version !== session.platform.terms_version) return <TermsPage />
  return (
    <SyncProvider>
      <LockProvider>
        <BlockGate>
          <AppRoutes />
        </BlockGate>
      </LockProvider>
    </SyncProvider>
  )
}

/** Barrière d'authentification : quel écran afficher selon l'état de la session. */
export function Gate() {
  const { state } = useAuth()
  switch (state.status) {
    case 'loading':
      return (
        <div className="p-6">
          <PageSkeleton />
        </div>
      )
    case 'signedOut':
      return <LoginPage />
    case 'needsNetwork':
      return <NeedsNetworkScreen />
    case 'disabled':
      return <DisabledScreen />
    case 'admin':
      return (
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      )
    case 'ready':
      return <ReadyApp />
  }
}
