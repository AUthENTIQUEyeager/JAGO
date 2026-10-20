import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { useOptionalAuth } from '@/auth/context'
import { isIos, isStandalone } from '@/pwa/storage'
import { useOptionalSyncStatus } from '@/sync/context'

const Banner = ({
  tone,
  children,
}: {
  tone: 'warn' | 'bad' | 'info'
  children: React.ReactNode
}) => (
  <p
    role="alert"
    className={`px-4 py-2 text-base font-semibold ${tone === 'bad' ? 'bg-red-100 text-red-900' : tone === 'warn' ? 'bg-accent-100 text-accent-900' : 'bg-sky-100 text-sky-900'}`}
  >
    {children}
  </p>
)

/** Bandeaux clairs : session expirée, ventes non envoyées depuis plus de 24 h, horloge décalée, maintenance, iPhone. */
export function StatusBanners() {
  const auth = useOptionalAuth()
  const sync = useOptionalSyncStatus()
  const db = auth?.state.status === 'ready' ? auth.state.db : null
  const stale = useLiveQuery(async () => {
    const first = db ? await db.outbox.orderBy('seq').first() : undefined
    return first ? Date.now() - Date.parse(first.created_at) > 86_400_000 : false
  }, [db])
  if (!auth || auth.state.status !== 'ready') return null
  return (
    <div>
      {auth.state.platform.maintenance_message ? (
        <Banner tone="info">{auth.state.platform.maintenance_message}</Banner>
      ) : null}
      {sync?.needsLogin ? (
        <Banner tone="bad">
          Votre session a expiré. Reconnectez-vous (Paramètres → Appareil) : vos données non
          envoyées sont conservées.
        </Banner>
      ) : null}
      {stale ? (
        <Banner tone="bad">
          Des ventes ne sont pas synchronisées depuis plus de 24 heures. Connectez l’appareil à
          internet.
          {isIos() && !isStandalone()
            ? ' Sur iPhone, installez l’application sur l’écran d’accueil pour protéger vos données.'
            : ''}
        </Banner>
      ) : null}
      {sync && sync.clockSkewSeconds !== null && Math.abs(sync.clockSkewSeconds) > 600 ? (
        <Banner tone="warn">
          L’heure de cet appareil est décalée de {Math.round(Math.abs(sync.clockSkewSeconds) / 60)}{' '}
          minutes. Corrigez-la dans les réglages du téléphone.
        </Banner>
      ) : null}
      {sync && sync.failed > 0 ? (
        <Banner tone="warn">
          {sync.failed} élément(s) n’ont pas pu être envoyés.{' '}
          <Link className="underline" to="/parametres">
            Voir les détails
          </Link>
        </Banner>
      ) : null}
      {auth.state.offline ? (
        <Banner tone="info">Ouvert hors ligne avec les données de cet appareil.</Banner>
      ) : null}
    </div>
  )
}
