import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { navItems } from '@/config/navigation'
import { fr } from '@/i18n/fr'

const secondaryItems = navItems.filter((item) => !item.mobile)

export default function MorePage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-brand-900">{fr.nav.more}</h1>
        <p className="text-base text-neutral-700">{fr.shell.moreHint}</p>
      </div>
      <ul className="divide-y divide-neutral-200 overflow-hidden rounded-2xl border border-neutral-300 bg-white">
        {secondaryItems.map((item) => (
          <li key={item.id}>
            <Link
              to={item.path}
              className="flex min-h-14 items-center gap-3 px-4 text-base font-semibold text-neutral-900 hover:bg-brand-50"
            >
              <item.icon className="h-6 w-6 text-brand-700" aria-hidden="true" />
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="h-5 w-5 text-neutral-600" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
