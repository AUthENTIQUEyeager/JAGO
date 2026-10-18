import { lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { navItems } from '@/config/navigation'

// Chaque écran est chargé à la demande pour garder un premier chargement léger.
const UpcomingPage = lazy(() => import('@/features/shell/UpcomingPage'))
const MorePage = lazy(() => import('@/features/shell/MorePage'))
const NotFoundPage = lazy(() => import('@/features/shell/NotFoundPage'))

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {navItems.map((item) => (
          <Route
            key={item.id}
            path={item.path}
            element={item.id === 'more' ? <MorePage /> : <UpcomingPage title={item.label} />}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
