import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/toast/ToastProvider'
import type { Env } from '@/config/env'
import { PwaPrompts } from '@/pwa/PwaPrompts'
import { Gate } from './Gate'

export default function App({ env }: { env: Env }) {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider env={env}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Gate />
            <PwaPrompts />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}
