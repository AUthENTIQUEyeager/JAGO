import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { brand } from '@/config/brand'
import { navItems } from '@/config/navigation'
import { fr } from '@/i18n/fr'
import { cn } from '@/lib/cn'
import { PageSkeleton } from './PageSkeleton'

const mobileItems = navItems.filter((item) => item.mobile)

/** Cadre de l’application : barre du bas sur téléphone, menu latéral sur ordinateur. */
export function AppShell() {
  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
      >
        {fr.shell.skipToContent}
      </a>

      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col md:border-r md:border-neutral-200 md:bg-white">
        <div className="px-5 py-5 text-2xl font-bold text-brand-800">{brand.name}</div>
        <nav aria-label={fr.shell.mainNav} className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-base font-semibold',
                  isActive ? 'bg-brand-700 text-white' : 'text-neutral-800 hover:bg-brand-50',
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main
        id="contenu"
        tabIndex={-1}
        className="min-w-0 flex-1 px-4 pb-28 pt-5 outline-none md:px-8 md:pb-8 md:pt-8"
      >
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>

      <nav
        aria-label={fr.shell.mainNav}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-300 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {mobileItems.map((item) => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-16 flex-col items-center justify-center gap-0.5 border-t-4 text-sm font-semibold',
                    isActive
                      ? 'border-accent-500 bg-brand-50 text-brand-900'
                      : 'border-transparent text-neutral-700',
                  )
                }
              >
                <item.icon className="h-6 w-6" aria-hidden="true" />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
