import type { ReactNode } from 'react'
import { fr } from '@/i18n/fr'
import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  loading?: boolean
  /** Contenu additionnel (ex. un champ « motif »). */
  children?: ReactNode
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmation avant une action destructrice. Le focus démarre sur « Annuler » (choix prudent). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = fr.common.confirm,
  cancelLabel = fr.common.cancel,
  tone = 'default',
  loading = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" autoFocus disabled={loading} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{message}</p>
      {children}
    </Modal>
  )
}
