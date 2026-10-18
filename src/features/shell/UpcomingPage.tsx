import { Construction } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import { fr } from '@/i18n/fr'

/** Écran pas encore construit : indique honnêtement qu’il arrivera plus tard. */
export default function UpcomingPage({ title }: { title: string }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
      <EmptyState
        icon={Construction}
        title={fr.upcoming.title}
        description={fr.upcoming.description}
      />
    </div>
  )
}
