import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { Select } from '@/components/Select'
import { useSession } from '@/auth/context'
import { verifyPin } from '@/auth/pin'
import { saveCustomer } from '@/db/repositories/people'
import { createSale, type SaleResult } from '@/db/repositories/sales'
import { PAYMENT_METHODS, type PaymentMethod } from '@/db/schemas'
import { fr } from '@/i18n/fr'
import { useAction } from '@/hooks/useAction'
import { formatMoney, parseMoney } from '@/lib/money'
import { approvalReasons } from '@/lib/override'
import { computeSale } from '@/lib/sale'
import { creditLimitExceeded } from '@/db/repositories/people'
import type { CartState } from './cart'

interface Props {
  cart: CartState
  onCustomer: (id: string | null) => void
  onDiscount: (amount: number) => void
  onDone: (result: SaleResult) => void
  onClose: () => void
}

export function Checkout({ cart, onCustomer, onDiscount, onDone, onClose }: Props) {
  const { db, ctx, settings, profile } = useSession()
  const customers = useLiveQuery(
    () => db.customers.filter((c) => !c.deleted_at).sortBy('name'),
    [db],
  )
  const balances = useLiveQuery(() => db.balance_cache.toArray(), [db])
  const [paid, setPaid] = useState<Record<PaymentMethod, string>>({
    cash: '',
    orange_money: '',
    moov_money: '',
    wave: '',
    other: '',
  })
  const [newName, setNewName] = useState('')
  const [approval, setApproval] = useState<'none' | 'approved' | 'flagged'>('none')
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const { run, busy } = useAction()

  const payments = PAYMENT_METHODS.flatMap((m) => {
    const amount = parseMoney(paid[m])
    return amount ? [{ method: m, amount }] : []
  })
  const calc = computeSale(cart.lines, cart.discount, payments)
  const reasons = approvalReasons(profile.role, settings, cart.lines, cart.discount)
  const needsApproval = reasons.length > 0 && approval === 'none'
  const customer = customers?.find((c) => c.id === cart.customer_id)
  const balance = balances?.find((b) => b.customer_id === cart.customer_id)?.balance ?? 0
  const overLimit =
    calc.credit_amount > 0 && customer
      ? creditLimitExceeded(balance, calc.credit_amount, customer.credit_limit)
      : false
  const creditWithoutCustomer = calc.credit_amount > 0 && !cart.customer_id

  async function checkPin() {
    const record = settings.manager_pin
    if (!record) return setPinError('Aucun code gérant n’est défini dans les paramètres.')
    if (await verifyPin(pin, record)) {
      setApproval('approved')
      setPinError(null)
    } else setPinError('Code incorrect.')
  }
  async function validate() {
    await run(async () => {
      const result = await createSale(ctx, {
        lines: cart.lines,
        discount: cart.discount,
        payments,
        customer_id: cart.customer_id,
        override: approval === 'flagged',
      })
      onDone(result)
    })
  }

  return (
    <Modal
      open
      title="Paiement"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Retour
          </Button>
          <Button
            size="lg"
            loading={busy}
            disabled={needsApproval || creditWithoutCustomer}
            onClick={() => void validate()}
          >
            Valider la vente
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-brand-50 p-3 text-center">
          <p className="text-sm font-semibold text-brand-900">Total à payer</p>
          <p className="text-3xl font-bold text-brand-900">{formatMoney(calc.total)}</p>
        </div>
        <Input
          label="Remise sur la vente (FCFA)"
          inputMode="numeric"
          value={cart.discount ? String(cart.discount) : ''}
          onChange={(e) => {
            onDiscount(parseMoney(e.target.value) ?? 0)
          }}
        />
        <div className="space-y-2">
          <p className="text-base font-semibold">Paiements</p>
          {PAYMENT_METHODS.map((m) => (
            <Input
              key={m}
              label={fr.methods[m]}
              inputMode="numeric"
              value={paid[m]}
              onChange={(e) => {
                setPaid((p) => ({ ...p, [m]: e.target.value }))
              }}
            />
          ))}
          <Button
            variant="ghost"
            onClick={() => {
              setPaid({
                cash: String(calc.total),
                orange_money: '',
                moov_money: '',
                wave: '',
                other: '',
              })
            }}
          >
            Tout en espèces
          </Button>
        </div>
        <div className="rounded-xl bg-neutral-100 p-3 text-base">
          <p>
            Payé : <b>{formatMoney(calc.paid_total)}</b>
          </p>
          {calc.change > 0 ? (
            <p>
              Monnaie à rendre : <b>{formatMoney(calc.change)}</b>
            </p>
          ) : null}
          {calc.credit_amount > 0 ? (
            <p className="text-red-800">
              Reste à payer (crédit) : <b>{formatMoney(calc.credit_amount)}</b>
            </p>
          ) : null}
        </div>
        {calc.credit_amount > 0 ? (
          <div className="space-y-2">
            <Select
              label="Client (obligatoire pour un crédit)"
              value={cart.customer_id ?? ''}
              onChange={(v) => {
                onCustomer(v || null)
              }}
              options={[
                { value: '', label: 'Choisir un client' },
                ...(customers ?? []).map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label="Nouveau client"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                  }}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  void run(async () => {
                    onCustomer(await saveCustomer(ctx, { name: newName }))
                    setNewName('')
                  })
                }
              >
                Ajouter
              </Button>
            </div>
            {creditWithoutCustomer ? (
              <p role="alert" className="text-base font-semibold text-red-800">
                Choisissez un client pour enregistrer le crédit.
              </p>
            ) : null}
            {overLimit ? (
              <p role="alert" className="text-base font-semibold text-accent-800">
                Attention : le plafond de crédit de ce client sera dépassé (vous pouvez continuer).
              </p>
            ) : null}
          </div>
        ) : null}
        {reasons.length > 0 && approval === 'none' ? (
          <div
            role="alert"
            className="space-y-2 rounded-xl border-2 border-accent-500 bg-accent-50 p-3"
          >
            <p className="text-base font-semibold text-accent-900">
              Accord du gérant nécessaire : {reasons.join(', ')}.
            </p>
            <Input
              label="Code du gérant"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ''))
              }}
              error={pinError ?? undefined}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void checkPin()} disabled={pin.length < 4}>
                Valider le code
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setApproval('flagged')
                }}
              >
                Gérant absent : continuer (sera signalé)
              </Button>
            </div>
          </div>
        ) : null}
        {approval !== 'none' ? (
          <p className="text-sm text-neutral-700">
            {approval === 'approved'
              ? 'Accord du gérant validé.'
              : 'Cette vente sera signalée dans « Contrôle ».'}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
