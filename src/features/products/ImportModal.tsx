import { useState } from 'react'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useSession } from '@/auth/context'
import { importProducts, productInputSchema, type ProductInput } from '@/db/repositories/products'
import { useAction } from '@/hooks/useAction'
import { CSV_LIMITS, parseCsv, toCsv } from '@/lib/csv'
import { downloadText } from '@/lib/download'
import { parseMoney, parseQty } from '@/lib/money'
import { normalizeText } from '@/lib/text'

const HEADER = [
  'nom',
  'prix_vente',
  'prix_achat',
  'prix_gros',
  'code_barres',
  'unite',
  'stock_initial',
  'seuil_alerte',
]

interface Preview {
  rows: ProductInput[]
  errors: Array<{ line: number; message: string }>
}

function toPreview(text: string): Preview {
  const table = parseCsv(text)
  if (table.length - 1 > CSV_LIMITS.maxRows)
    return {
      rows: [],
      errors: [{ line: 0, message: `Fichier trop long (${CSV_LIMITS.maxRows} lignes maximum).` }],
    }
  const head = (table[0] ?? []).map((h) => normalizeText(h).replace(/[\s-]+/g, '_'))
  if (!head.includes('nom') || !head.includes('prix_vente'))
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: 'Colonnes « nom » et « prix_vente » obligatoires. Utilisez le modèle.',
        },
      ],
    }
  const col = (row: string[], name: string) => (row[head.indexOf(name)] ?? '').trim()
  const rows: ProductInput[] = []
  const errors: Preview['errors'] = []
  table.slice(1).forEach((row, i) => {
    const price = parseMoney(col(row, 'prix_vente'))
    const item: ProductInput = {
      name: col(row, 'nom'),
      sale_price: price ?? -1,
      cost_price: parseMoney(col(row, 'prix_achat')),
      wholesale_price: parseMoney(col(row, 'prix_gros')),
      barcode: col(row, 'code_barres'),
      unit: col(row, 'unite') || 'pièce',
      opening_qty: parseQty(col(row, 'stock_initial')) ?? 0,
      low_stock_threshold: parseQty(col(row, 'seuil_alerte')) ?? 0,
    }
    const check = productInputSchema.safeParse(item)
    if (price === null) errors.push({ line: i + 2, message: 'Prix de vente invalide.' })
    else if (!check.success)
      errors.push({ line: i + 2, message: check.error.issues[0]?.message ?? 'Ligne invalide.' })
    else rows.push(item)
  })
  return { rows, errors }
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const { ctx } = useSession()
  const { run, busy } = useAction()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > CSV_LIMITS.maxBytes)
      return setPreview({
        rows: [],
        errors: [{ line: 0, message: 'Fichier trop gros (5 Mo maximum).' }],
      })
    setPreview(toPreview(await file.text()))
    setResult(null)
  }
  async function doImport() {
    if (!preview) return
    await run(async () => {
      const report = await importProducts(ctx, preview.rows)
      setResult(
        `${report.created} produit(s) importé(s)${
          report.errors.length
            ? `, ${report.errors.length} ligne(s) refusée(s) : ${report.errors
                .slice(0, 5)
                .map((e) => `ligne ${e.line} (${e.message})`)
                .join(' ; ')}`
            : ''
        }.`,
      )
      setPreview(null)
    })
  }
  return (
    <Modal
      open
      title="Importer des produits (CSV)"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          {preview && preview.rows.length > 0 ? (
            <Button loading={busy} onClick={() => void doImport()}>
              Importer {preview.rows.length} produit(s)
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <Button
          variant="secondary"
          onClick={() => {
            downloadText(
              'modele-produits.csv',
              toCsv(HEADER, [['Riz 25 kg', 15000, 12000, 14000, '6001234', 'sac', 10, 2]]),
            )
          }}
        >
          Télécharger le modèle
        </Button>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Choisir un fichier CSV"
          className="block w-full text-base"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        {preview ? (
          <div className="space-y-2 text-base">
            <p className="font-semibold">
              {preview.rows.length} ligne(s) valide(s), {preview.errors.length} erreur(s).
            </p>
            {preview.rows.slice(0, 5).map((r, i) => (
              <p key={i} className="text-neutral-800">
                • {r.name} — {r.sale_price} FCFA
              </p>
            ))}
            {preview.errors.length > 0 ? (
              <ul className="list-disc pl-5 text-red-800">
                {preview.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    {e.line ? `Ligne ${e.line} : ` : ''}
                    {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {result ? (
          <p role="status" className="rounded-xl bg-brand-50 p-3 text-base text-brand-900">
            {result}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
