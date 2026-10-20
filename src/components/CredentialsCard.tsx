import { Copy } from 'lucide-react'
import { Button } from './Button'
import { useToast } from './toast/useToast'

/** Fiche d'identifiants à copier/partager. Le mot de passe n'est affiché qu'une seule fois, jamais enregistré. */
export function CredentialsCard({
  identifier,
  password,
  appUrl,
}: {
  identifier: string
  password: string
  appUrl: string
}) {
  const toast = useToast()
  const text = `Application : ${appUrl}\nIdentifiant : ${identifier}\nMot de passe temporaire : ${password}\nVous devrez choisir un nouveau mot de passe à la première connexion.`
  return (
    <div className="space-y-2 rounded-xl border-2 border-accent-500 bg-accent-50 p-4">
      <p className="text-base font-semibold text-accent-900">
        Notez ou envoyez ces identifiants maintenant : le mot de passe ne sera plus affiché.
      </p>
      <pre className="whitespace-pre-wrap break-all rounded-lg bg-white p-3 font-mono text-base">
        {text}
      </pre>
      <Button
        variant="accent"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(
            () => {
              toast.success('Identifiants copiés.')
            },
            () => {
              toast.error('Copie impossible : recopiez à la main.')
            },
          )
        }}
      >
        <Copy className="h-5 w-5" aria-hidden="true" />
        Copier
      </Button>
    </div>
  )
}
