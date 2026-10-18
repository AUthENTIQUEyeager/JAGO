import { fr } from '@/i18n/fr'

/** Écran affiché si la configuration (.env) est absente ou invalide. */
export function EnvErrorScreen({ errors }: { errors: readonly string[] }) {
  return (
    <div role="alert" className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold text-red-800">{fr.errors.envTitle}</h1>
      <p className="text-base text-neutral-800">{fr.errors.envBody}</p>
      <ul className="list-disc space-y-1 pl-5 text-base text-neutral-900">
        {errors.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  )
}
