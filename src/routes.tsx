import { lazy, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { RequireManager } from '@/components/RequireManager'
import { navItems } from '@/config/navigation'

// Chaque écran est chargé à la demande pour garder un premier chargement léger.
const PosPage = lazy(() => import('@/features/pos/PosPage'))
const ProductsPage = lazy(() => import('@/features/products/ProductsPage'))
const StockPage = lazy(() => import('@/features/stock/StockPage'))
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage'))
const MorePage = lazy(() => import('@/features/shell/MorePage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const SalesPage = lazy(() => import('@/features/sales/SalesPage'))
const SuppliersPage = lazy(() => import('@/features/suppliers/SuppliersPage'))
const ExpensesPage = lazy(() => import('@/features/expenses/ExpensesPage'))
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage'))
const ControlPage = lazy(() => import('@/features/control/ControlPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const NotFoundPage = lazy(() => import('@/features/shell/NotFoundPage'))

const manager = (page: ReactNode) => <RequireManager>{page}</RequireManager>
const PAGES: Record<string, ReactNode> = {
  cashier: <PosPage />,
  products: <ProductsPage />,
  stock: <StockPage />,
  customers: <CustomersPage />,
  more: <MorePage />,
  dashboard: <DashboardPage />,
  sales: <SalesPage />,
  suppliers: manager(<SuppliersPage />),
  expenses: manager(<ExpensesPage />),
  reports: manager(<ReportsPage />),
  control: manager(<ControlPage />),
  settings: <SettingsPage />,
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {navItems.map((item) => (
          <Route key={item.id} path={item.path} element={PAGES[item.id]} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
