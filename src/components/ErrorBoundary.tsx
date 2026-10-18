import { Component, type ErrorInfo, type ReactNode } from 'react'
import { fr } from '@/i18n/fr'
import { Button } from './Button'

interface State {
  error: Error | null
}

/**
 * Un plantage d’écran ne doit jamais effacer ni bloquer les données :
 * cette barrière n’écrit rien, elle affiche seulement un message et propose de réessayer.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erreur d’affichage', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6"
      >
        <h1 className="text-2xl font-bold text-red-800">{fr.errors.boundaryTitle}</h1>
        <p className="text-base text-neutral-800">{fr.errors.boundaryBody}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => {
              this.setState({ error: null })
            }}
          >
            {fr.errors.boundaryRetry}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              window.location.reload()
            }}
          >
            {fr.errors.boundaryReload}
          </Button>
        </div>
      </div>
    )
  }
}
