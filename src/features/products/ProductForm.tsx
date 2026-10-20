import { useState } from 'react'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Modal } from '@/components/Modal'
import { Select } from '@/components/Select'
import { useSession } from '@/auth/context'
import { isManager } from '@/db/ctx'
import type { Category, Product } from '@/db/schemas'
import { saveProduct } from '@/db/repositories/products'
import { useAction } from '@/hooks/useAction'
import { parseMoney, parseQty } from '@/lib/money'

const optionalMoney = (v: string) => (v.trim() === '' ? null : parseMoney(v))

export function ProductForm({
  product,
  cost,
  categories,
  onClose,
}: {
  product: Product | null
  cost: number | null
  categories: Category[]
  onClose: () => void
}) {
  const { ctx } = useSession()
  const { run, busy } = useAction()
  const manager = isManager(ctx)
  const [f, setF] = useState({
    name: product?.name ?? '',
    kind: product?.kind ?? 'product',
    barcode: product?.barcode ?? '',
    category_id: product?.category_id ?? '',
    unit: product?.unit ?? 'pièce',
    sale_price: product ? String(product.sale_price) : '',
    wholesale_price: product?.wholesale_price != null ? String(product.wholesale_price) : '',
    cost_price: cost !== null ? String(cost) : '',
    track_stock: product?.track_stock ?? true,
    low_stock_threshold: product ? String(product.low_stock_threshold) : '0',
    opening_qty: '',
    is_active: product?.is_active ?? true,
  })
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => {
    setF((prev) => ({ ...prev, [key]: value }))
  }

  async function submit() {
    const ok = await run(async () => {
      const sale = parseMoney(f.sale_price)
      if (sale === null) throw new Error('Le prix de vente est invalide.')
      await saveProduct(
        ctx,
        {
          name: f.name,
          kind: f.kind,
          barcode: f.barcode,
          category_id: f.category_id || null,
          unit: f.unit,
          sale_price: sale,
          wholesale_price: optionalMoney(f.wholesale_price),
          cost_price: optionalMoney(f.cost_price),
          track_stock: f.track_stock,
          low_stock_threshold: parseQty(f.low_stock_threshold) ?? 0,
          opening_qty: product ? 0 : (parseQty(f.opening_qty) ?? 0),
          is_active: f.is_active,
        },
        product?.id,
      )
    }, 'Produit enregistré.')
    if (ok) onClose()
  }
  return (
    <Modal
      open
      title={product ? 'Modifier le produit' : 'Nouveau produit'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={busy} onClick={() => void submit()}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Nom"
          value={f.name}
          onChange={(e) => {
            set('name', e.target.value)
          }}
        />
        <Select
          label="Type"
          value={f.kind}
          onChange={(v) => {
            set('kind', v === 'service' ? 'service' : 'product')
          }}
          options={[
            { value: 'product', label: 'Produit' },
            { value: 'service', label: 'Service (sans stock)' },
          ]}
        />
        <Input
          label="Prix de vente (FCFA)"
          inputMode="numeric"
          value={f.sale_price}
          onChange={(e) => {
            set('sale_price', e.target.value)
          }}
        />
        {manager ? (
          <Input
            label="Prix d’achat (FCFA)"
            inputMode="numeric"
            value={f.cost_price}
            onChange={(e) => {
              set('cost_price', e.target.value)
            }}
            hint="Visible seulement par le propriétaire et le gérant."
          />
        ) : null}
        <Input
          label="Prix de gros (facultatif)"
          inputMode="numeric"
          value={f.wholesale_price}
          onChange={(e) => {
            set('wholesale_price', e.target.value)
          }}
        />
        <Input
          label="Code-barres (facultatif)"
          value={f.barcode}
          onChange={(e) => {
            set('barcode', e.target.value)
          }}
        />
        <Select
          label="Catégorie"
          value={f.category_id}
          onChange={(v) => {
            set('category_id', v)
          }}
          options={[
            { value: '', label: 'Aucune' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Input
          label="Unité (pièce, kg, litre, carton…)"
          value={f.unit}
          onChange={(e) => {
            set('unit', e.target.value)
          }}
        />
        {f.kind === 'product' ? (
          <>
            <label className="flex min-h-11 items-center gap-3 text-base font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={f.track_stock}
                onChange={(e) => {
                  set('track_stock', e.target.checked)
                }}
              />
              Suivre le stock
            </label>
            {f.track_stock ? (
              <Input
                label="Alerte de stock bas à partir de"
                inputMode="decimal"
                value={f.low_stock_threshold}
                onChange={(e) => {
                  set('low_stock_threshold', e.target.value)
                }}
              />
            ) : null}
            {f.track_stock && !product ? (
              <Input
                label="Stock de départ"
                inputMode="decimal"
                value={f.opening_qty}
                onChange={(e) => {
                  set('opening_qty', e.target.value)
                }}
              />
            ) : null}
          </>
        ) : null}
        <label className="flex min-h-11 items-center gap-3 text-base font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={f.is_active}
            onChange={(e) => {
              set('is_active', e.target.checked)
            }}
          />
          Produit actif (vendable)
        </label>
      </div>
    </Modal>
  )
}
