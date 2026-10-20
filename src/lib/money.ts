const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const qf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 })

/** « 12 500 FCFA » : fonction unique d'affichage de l'argent (FCFA, sans décimales). */
export function formatMoney(amount: number): string {
  return `${nf.format(Math.round(amount))} FCFA`
}

export function formatQty(qty: number): string {
  return qf.format(qty)
}

/** Lit un montant saisi (« 12 500 », « 12500 FCFA »). Renvoie un entier ≥ 0, sinon null. */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/FCFA|XOF|F\b/gi, '').replace(/[\s\u00a0\u202f]/g, '')
  if (!/^\d{1,13}$/.test(cleaned)) return null
  return Number(cleaned)
}

/** Lit une quantité (virgule ou point, 3 décimales max). Renvoie un nombre > 0, sinon null. */
export function parseQty(input: string): number | null {
  const cleaned = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return value > 0 ? value : null
}

/** Total d'une ligne : quantité (3 décimales) × prix, moins la remise. Arithmétique entière, jamais négatif. */
export function lineTotal(qty: number, unitPrice: number, lineDiscount = 0): number {
  const milli = Math.round(qty * 1000)
  return Math.max(0, Math.round((milli * unitPrice) / 1000) - lineDiscount)
}

export function percentOf(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100)
}

/** Somme de quantités sans dérive de virgule flottante (3 décimales). */
export function sumQty(values: readonly number[]): number {
  return values.reduce((total, v) => total + Math.round(v * 1000), 0) / 1000
}
