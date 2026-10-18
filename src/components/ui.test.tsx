import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { ErrorBoundary } from './ErrorBoundary'
import { Input } from './Input'
import { TabPanel, Tabs } from './Tabs'
import { ToastProvider } from './toast/ToastProvider'
import { useToast } from './toast/useToast'

afterEach(() => {
  vi.useRealTimers()
})

describe('Button', () => {
  it('est désactivé et signale le chargement (pas de double clic)', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Valider
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Valider' })
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})

describe('Input', () => {
  it('relie le libellé, l’aide et l’erreur au champ', () => {
    render(<Input label="Téléphone" hint="8 chiffres" error="Numéro incorrect" />)
    const input = screen.getByLabelText('Téléphone')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    expect(describedBy.split(' ')).toHaveLength(2)
    expect(screen.getByText('Numéro incorrect').id).toBe(describedBy.split(' ')[1])
  })
})

describe('ConfirmDialog', () => {
  function setup(overrides: Partial<{ loading: boolean }> = {}) {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Annuler la vente ?"
        message="Le stock sera remis."
        confirmLabel="Annuler la vente"
        cancelLabel="Garder"
        tone="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...overrides}
      />,
    )
    return { onConfirm, onCancel }
  }

  it('met le focus sur le choix prudent et ferme avec Échap', () => {
    const { onCancel, onConfirm } = setup()
    expect(screen.getByRole('dialog', { name: 'Annuler la vente ?' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Garder' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('appelle onConfirm au clic sur le bouton de confirmation', () => {
    const { onConfirm } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Annuler la vente' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('ne se ferme pas avec Échap pendant un enregistrement', () => {
    const { onCancel } = setup({ loading: true })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('garde le focus dans la fenêtre avec Tab', () => {
    setup()
    const keep = screen.getByRole('button', { name: 'Garder' })
    const confirm = screen.getByRole('button', { name: 'Annuler la vente' })
    confirm.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(keep)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
  })
})

describe('Tabs', () => {
  function Demo() {
    const [value, setValue] = useState('a')
    return (
      <>
        <Tabs
          idPrefix="demo"
          ariaLabel="Période"
          value={value}
          onChange={setValue}
          tabs={[
            { id: 'a', label: 'Aujourd’hui' },
            { id: 'b', label: '7 jours' },
            { id: 'c', label: 'Mois' },
          ]}
        />
        <TabPanel idPrefix="demo" id="a" active={value === 'a'}>
          Contenu A
        </TabPanel>
        <TabPanel idPrefix="demo" id="b" active={value === 'b'}>
          Contenu B
        </TabPanel>
      </>
    )
  }

  it('change d’onglet au clavier avec les flèches', () => {
    render(<Demo />)
    const first = screen.getByRole('tab', { name: 'Aujourd’hui' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    const second = screen.getByRole('tab', { name: '7 jours' })
    expect(second.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(second)
    expect(screen.getByText('Contenu B')).toBeTruthy()
    expect(screen.queryByText('Contenu A')).toBeNull()
    fireEvent.keyDown(second, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'Mois' }).getAttribute('aria-selected')).toBe('true')
  })
})

describe('Toast', () => {
  function Trigger() {
    const toast = useToast()
    return (
      <>
        <button
          onClick={() => {
            toast.success('Vente enregistrée')
          }}
        >
          ok
        </button>
        <button
          onClick={() => {
            toast.error('Échec de l’envoi')
          }}
        >
          ko
        </button>
      </>
    )
  }

  it('affiche un message puis le retire tout seul', () => {
    vi.useFakeTimers()
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('ok'))
    expect(screen.getByRole('status').textContent).toContain('Vente enregistrée')
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(screen.queryByText('Vente enregistrée')).toBeNull()
  })

  it('annonce les erreurs et permet de les fermer', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByText('ko'))
    expect(screen.getByRole('alert').textContent).toContain('Échec de l’envoi')
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('ErrorBoundary', () => {
  it('affiche un message clair au lieu de planter, et permet de réessayer', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // jsdom relaie l’erreur volontaire du test comme « non interceptée » : on la masque.
    const muteWindowError = (event: ErrorEvent) => {
      event.preventDefault()
    }
    window.addEventListener('error', muteWindowError)
    let shouldThrow = true
    function Fragile() {
      if (shouldThrow) throw new Error('boum')
      return <p>Écran rétabli</p>
    }
    render(
      <ErrorBoundary>
        <Fragile />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert').textContent).toContain('Un problème est survenu')
    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Réafficher l’écran' }))
    expect(screen.getByText('Écran rétabli')).toBeTruthy()
    window.removeEventListener('error', muteWindowError)
    consoleError.mockRestore()
  })
})
