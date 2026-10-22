import { useState } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useSession } from '@/auth/context'
import { ACTIVITIES, toProductInput } from '@/config/activities'
import { importProducts, saveCategory } from '@/db/repositories/products'
import { useAction } from '@/hooks/useAction'
import { useToast } from '@/components/toast/useToast'
import { normalizeText } from '@/lib/text'

/** Ajoute en un clic les services d'une activité (unités, impression…). Les produits déjà présents sont ignorés. */
export function TemplatesModal({ onClose }: { onClose: () => void }) {
  const { db, ctx } = useSession()
  const toast = useToast()
  const { run, busy } = useAction()
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) => {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function add() {
    const ok = await run(async () => {
      let created = 0
      for (const activity of ACTIVITIES.filter((a) => chosen.has(a.id))) {
        const categories = await db.categories.filter((c) => !c.deleted_at).toArray()
        const category = categories.find(
          (c) => normalizeText(c.name) === normalizeText(activity.category),
        )
        const categoryId = category?.id ?? (await saveCategory(ctx, activity.category))
        const existing = new Set(
          (await db.products.filter((p) => !p.deleted_at).toArray()).map((p) =>
            normalizeText(p.name),
          ),
        )
        const rows = activity.items
          .filter((item) => !existing.has(normalizeText(item.name)))
          .map((item) => toProductInput(item, categoryId))
        if (rows.length > 0) created += (await importProducts(ctx, rows)).created
      }
      toast.success(
        created > 0
          ? `${created} produit(s) ajouté(s). Ajustez les prix dans la liste.`
          : 'Ces produits existent déjà.',
      )
    })
    if (ok) onClose()
  }

  return (
    <Modal
      open
      title="Modèles d’activité"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button loading={busy} disabled={chosen.size === 0} onClick={() => void add()}>
            Ajouter
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-base">
          Choisissez votre activité : les produits et services habituels sont créés pour vous. Les
          prix sont des exemples, modifiez-les ensuite.
        </p>
        {ACTIVITIES.map((a) => (
          <label
            key={a.id}
            className="flex min-h-11 items-start gap-3 rounded-xl border border-neutral-300 p-3"
          >
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={chosen.has(a.id)}
              onChange={() => {
                toggle(a.id)
              }}
            />
            <span>
              <span className="block text-base font-semibold">{a.label}</span>
              <span className="block text-sm text-neutral-700">{a.description}</span>
              <span className="block text-sm text-neutral-700">
                {a.items.map((i) => i.name).join(', ')}
              </span>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  )
}
