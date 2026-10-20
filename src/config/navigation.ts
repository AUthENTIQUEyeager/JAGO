import {
  Boxes,
  ChartColumn,
  Ellipsis,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { fr } from '@/i18n/fr'

export interface NavItem {
  id: string
  path: string
  label: string
  icon: LucideIcon
  /** Affiché dans la barre du bas sur téléphone. */
  mobile: boolean
  /** Masqué pour le caissier (la vraie protection est dans la base de données). */
  managerOnly?: boolean
}

/** Écrans de l'application. Un nouvel écran = une ligne ici + sa page dans routes.tsx. */
export const navItems: readonly NavItem[] = [
  { id: 'cashier', path: '/', label: fr.nav.cashier, icon: ShoppingCart, mobile: true },
  { id: 'products', path: '/produits', label: fr.nav.products, icon: Package, mobile: true },
  { id: 'stock', path: '/stock', label: fr.nav.stock, icon: Boxes, mobile: true },
  { id: 'customers', path: '/clients', label: fr.nav.customers, icon: Users, mobile: true },
  { id: 'more', path: '/plus', label: fr.nav.more, icon: Ellipsis, mobile: true },
  {
    id: 'dashboard',
    path: '/tableau-de-bord',
    label: fr.nav.dashboard,
    icon: LayoutDashboard,
    mobile: false,
  },
  { id: 'sales', path: '/ventes', label: fr.nav.sales, icon: Receipt, mobile: false },
  {
    id: 'suppliers',
    path: '/fournisseurs',
    label: fr.nav.suppliers,
    icon: Truck,
    mobile: false,
    managerOnly: true,
  },
  {
    id: 'expenses',
    path: '/depenses',
    label: fr.nav.expenses,
    icon: Wallet,
    mobile: false,
    managerOnly: true,
  },
  {
    id: 'reports',
    path: '/rapports',
    label: fr.nav.reports,
    icon: ChartColumn,
    mobile: false,
    managerOnly: true,
  },
  {
    id: 'control',
    path: '/controle',
    label: fr.nav.control,
    icon: ShieldCheck,
    mobile: false,
    managerOnly: true,
  },
  { id: 'settings', path: '/parametres', label: fr.nav.settings, icon: Settings, mobile: false },
]
