import { useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { formatMoney, parseMoney } from '@/lib/money'

const QUICK = [500, 1000, 2000, 5000, 10000]

/** Saisie du montant d'un service à montant libre (unités, rédaction…). */
export function OpenAmountModal({
  name,
  onConfirm,
  onClose,
}: {
  name: string
  onConfirm: (amount: number) => void
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const amount = parseMoney(value)
  const valid = amount !== null && amount > 0
  const submit = () => {
    if (valid) onConfirm(amount)
  }
  return (
    <Modal
      open
      title={name}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button disabled={!valid} onClick={submit}>
            Ajouter
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input
          label="Montant (FCFA)"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
          }}
        />
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Button
              key={q}
              type="button"
              variant="secondary"
              onClick={() => {
                onConfirm(q)
              }}
            >
              {formatMoney(q)}
            </Button>
          ))}
        </div>
      </form>
    </Modal>
  )
}
