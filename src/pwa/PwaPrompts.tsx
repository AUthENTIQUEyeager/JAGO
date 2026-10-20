import { Download, RefreshCw } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/Button'
import { getSaleInProgress, subscribeActivity } from './activity'
import { applyUpdate, getNeedRefresh, subscribeUpdate } from './updateStore'

interface InstallEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Bandeau « Nouvelle version disponible » (activation au clic, et seulement hors vente) + bouton « Installer ». */
export function PwaPrompts() {
  const needRefresh = useSyncExternalStore(subscribeUpdate, getNeedRefresh)
  const saleBusy = useSyncExternalStore(subscribeActivity, getSaleInProgress)
  const [install, setInstall] = useState<InstallEvent | null>(null)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstall(event as InstallEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
    }
  }, [])

  if (!needRefresh && !install) return null
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 mx-auto flex max-w-md flex-col gap-2 px-3 md:bottom-4">
      {needRefresh ? (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl bg-brand-800 p-3 text-white shadow-lg"
        >
          <span className="text-base font-semibold">
            {saleBusy
              ? 'Nouvelle version prête : terminez la vente en cours.'
              : 'Nouvelle version disponible'}
          </span>
          <Button variant="accent" disabled={saleBusy} onClick={() => void applyUpdate()}>
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            Mettre à jour
          </Button>
        </div>
      ) : null}
      {install ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-lg ring-1 ring-neutral-300">
          <span className="text-base font-semibold">Installer l’application sur cet appareil</span>
          <Button
            onClick={() =>
              void install.prompt().then(() => {
                setInstall(null)
              })
            }
          >
            <Download className="h-5 w-5" aria-hidden="true" />
            Installer
          </Button>
        </div>
      ) : null}
    </div>
  )
}
