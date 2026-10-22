import type { ProductInput } from '@/db/repositories/products'

/**
 * Modèles de produits par activité (ajout en un clic depuis « Produits → Modèles »).
 * Les prix sont des exemples à ajuster. « open » = montant libre saisi à chaque vente ; pour ces lignes,
 * `cost_percent` est le pourcentage du montant que la boutique paie (97 = 3 % de marge).
 */
export interface ActivityItem {
  name: string
  unit: string
  /** Prix de vente (FCFA) ; ignoré si `open`. */
  price?: number
  open?: boolean
  cost_percent?: number
}
export interface Activity {
  id: string
  label: string
  description: string
  category: string
  items: readonly ActivityItem[]
}

export const ACTIVITIES: readonly Activity[] = [
  {
    id: 'units',
    label: 'Unités et transferts',
    description: 'Vente d’unités (crédit téléphone), forfaits internet, commissions de transfert.',
    category: 'Unités et transferts',
    items: [
      { name: 'Unités Orange', unit: 'FCFA', open: true, cost_percent: 97 },
      { name: 'Unités Moov', unit: 'FCFA', open: true, cost_percent: 97 },
      { name: 'Unités Telecel', unit: 'FCFA', open: true, cost_percent: 97 },
      { name: 'Unités MTN', unit: 'FCFA', open: true, cost_percent: 97 },
      { name: 'Forfait internet', unit: 'forfait', open: true, cost_percent: 97 },
      { name: 'Commission transfert d’argent', unit: 'FCFA', open: true, cost_percent: 0 },
    ],
  },
  {
    id: 'print',
    label: 'Impression, photocopie et rédaction',
    description: 'Cybercafé, secrétariat, reprographie : prix à la page, au document ou libre.',
    category: 'Impression et rédaction',
    items: [
      { name: 'Photocopie noir et blanc', unit: 'page', price: 25 },
      { name: 'Impression noir et blanc', unit: 'page', price: 50 },
      { name: 'Impression couleur', unit: 'page', price: 200 },
      { name: 'Scan de document', unit: 'page', price: 100 },
      { name: 'Saisie / rédaction de document', unit: 'page', price: 500 },
      { name: 'Rédaction sur mesure (CV, lettre, rapport…)', unit: 'document', open: true },
      { name: 'Reliure', unit: 'pièce', price: 500 },
      { name: 'Plastification', unit: 'pièce', price: 300 },
    ],
  },
]

export function toProductInput(item: ActivityItem, categoryId: string): ProductInput {
  return {
    name: item.name,
    kind: 'service',
    category_id: categoryId,
    unit: item.unit,
    sale_price: item.open ? 0 : (item.price ?? 0),
    cost_price: item.open ? (item.cost_percent ?? null) : null,
    track_stock: false,
  }
}
