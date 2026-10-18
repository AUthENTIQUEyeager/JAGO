import { SearchX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buttonStyles } from '@/components/button-styles'
import { EmptyState } from '@/components/EmptyState'
import { fr } from '@/i18n/fr'

export default function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title={fr.notFound.title}
      description={fr.notFound.description}
      action={
        <Link to="/" className={buttonStyles({ variant: 'primary' })}>
          {fr.notFound.action}
        </Link>
      }
    />
  )
}
