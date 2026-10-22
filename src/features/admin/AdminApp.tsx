import { Inbox, ScrollText, Settings, Store } from 'lucide-react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { Button } from '@/components/Button'
import { useAuth } from '@/auth/context'
import { brand } from '@/config/brand'
import { cn } from '@/lib/cn'
import { AuditPage } from './AuditPage'
import { MfaGate } from './MfaGate'
import { PlatformPage } from './PlatformPage'
import { ShopDetailPage } from './ShopDetailPage'
import { ShopsPage } from './ShopsPage'
import { SignupsPage } from './SignupsPage'

const links = [
  { to: '/admin', label: 'Boutiques', icon: Store, end: true },
  { to: '/admin/demandes', label: 'Demandes', icon: Inbox, end: false },
  { to: '/admin/journal', label: 'Journal d’audit', icon: ScrollText, end: false },
  { to: '/admin/plateforme', label: 'Plateforme', icon: Settings, end: false },
]

/** Interface du vendeur du logiciel. Chaque donnée est servie par /api après vérification serveur (MFA aal2) : masquer des boutons ne protège rien. */
export default function AdminApp() {
  const { signOut, state } = useAuth()
  return (
    <MfaGate>
      <div className="min-h-dvh md:flex">
        <aside className="border-b border-neutral-200 bg-white p-3 md:h-dvh md:w-60 md:border-b-0 md:border-r">
          <p className="px-2 text-xl font-bold text-brand-800">{brand.name} · Admin</p>
          <p className="truncate px-2 pb-2 text-sm text-neutral-700">
            {state.status === 'admin' ? state.email : ''}
          </p>
          <nav aria-label="Administration" className="flex gap-1 overflow-x-auto md:flex-col">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-base font-semibold',
                    isActive ? 'bg-brand-700 text-white' : 'text-neutral-800 hover:bg-brand-50',
                  )
                }
              >
                <l.icon className="h-5 w-5" aria-hidden="true" />
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="pt-3">
            <Button variant="ghost" onClick={() => void signOut()}>
              Se déconnecter
            </Button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <Routes>
            <Route index element={<ShopsPage />} />
            <Route path="boutiques/:id" element={<ShopDetailPage />} />
            <Route path="demandes" element={<SignupsPage />} />
            <Route path="journal" element={<AuditPage />} />
            <Route path="plateforme" element={<PlatformPage />} />
          </Routes>
        </main>
      </div>
    </MfaGate>
  )
}
