import { fr } from '@/i18n/fr'
import { formatDateTime } from './dates'
import { formatMoney, formatQty } from './money'
import { phoneDigits } from './phone'

export interface ReceiptData {
  shopName: string
  address: string
  phone: string
  footer: string
  paper: 58 | 80
  receiptNo: string
  date: string
  customerName: string | null
  lines: Array<{
    name: string
    qty: number
    unit_price: number
    line_discount: number
    line_total: number
  }>
  subtotal: number
  discount: number
  total: number
  payments: Array<{ method: string; amount: number }>
  paid_total: number
  credit_amount: number
  voided: boolean
}

export const RECEIPT_MENTION = 'Reçu — ne vaut pas facture certifiée'
const label = (method: string) => (fr.methods as Record<string, string>)[method] ?? method
const money = (n: number) => formatMoney(n).replace(/[\u202f\u00a0]/g, ' ')

function twoColumns(left: string, right: string, width: number): string {
  const space = Math.max(1, width - left.length - right.length)
  return left.length + right.length + 1 > width
    ? `${left}\n${right.padStart(width)}`
    : `${left}${' '.repeat(space)}${right}`
}

/** Retour à la ligne par mots (un mot trop long est coupé). Les lignes déjà assez courtes sont gardées telles quelles. */
export function wrap(line: string, width: number): string[] {
  if (line.length <= width) return [line]
  const out: string[] = []
  let current = ''
  for (const word of line.split(' ')) {
    let rest = word
    while (rest.length > width) {
      if (current) {
        out.push(current)
        current = ''
      }
      out.push(rest.slice(0, width))
      rest = rest.slice(width)
    }
    if (!current) current = rest
    else if (current.length + 1 + rest.length <= width) current += ` ${rest}`
    else {
      out.push(current)
      current = rest
    }
  }
  if (current) out.push(current)
  return out
}

/** Lignes du ticket, mises en page pour 58 mm (32 caractères) ou 80 mm (48). Texte brut : rien d'exécutable. */
export function receiptLines(d: ReceiptData): string[] {
  const w = d.paper === 58 ? 32 : 48
  const rule = '-'.repeat(w)
  const out = [
    d.shopName,
    d.address,
    d.phone ? `Tél : ${d.phone}` : '',
    rule,
    `Reçu ${d.receiptNo}`,
    formatDateTime(d.date),
  ]
  if (d.customerName) out.push(`Client : ${d.customerName}`)
  if (d.voided) out.push('*** VENTE ANNULÉE ***')
  out.push(rule)
  for (const l of d.lines) {
    out.push(l.name)
    out.push(
      twoColumns(
        `  ${formatQty(l.qty)} x ${money(l.unit_price)}`,
        money(l.line_total + l.line_discount),
        w,
      ),
    )
    if (l.line_discount > 0) out.push(twoColumns('  Remise', `-${money(l.line_discount)}`, w))
  }
  out.push(rule)
  if (d.discount > 0) out.push(twoColumns('Remise', `-${money(d.discount)}`, w))
  out.push(twoColumns('TOTAL', money(d.total), w))
  for (const p of d.payments) out.push(twoColumns(label(p.method), money(p.amount), w))
  if (d.credit_amount > 0) out.push(twoColumns('RESTE À PAYER (crédit)', money(d.credit_amount), w))
  out.push(rule, d.footer, RECEIPT_MENTION)
  return out
    .filter((line, i) => line !== '' || i > 5)
    .flatMap((line) => line.split('\n'))
    .flatMap((line) => wrap(line, w))
}

/** Reçu en texte compact pour WhatsApp. */
export function receiptText(d: ReceiptData): string {
  const items = d.lines.map(
    (l) => `• ${l.name} : ${formatQty(l.qty)} x ${money(l.unit_price)} = ${money(l.line_total)}`,
  )
  const pay = d.payments.map((p) => `${label(p.method)} ${money(p.amount)}`).join(', ')
  return [
    `${d.shopName} — Reçu ${d.receiptNo}`,
    formatDateTime(d.date),
    ...items,
    `Total : ${money(d.total)}`,
    pay ? `Payé : ${pay}` : '',
    d.credit_amount > 0 ? `Reste à payer : ${money(d.credit_amount)}` : '',
    d.footer,
    RECEIPT_MENTION,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Relevé de dette d'un client, en texte. */
export function statementText(
  shopName: string,
  customerName: string,
  balance: number,
  entries: ReadonlyArray<{ date: string; label: string; amount: number }>,
): string {
  const rows = entries
    .slice(0, 15)
    .map(
      (e) =>
        `${formatDateTime(e.date).slice(0, 10)} ${e.label} : ${e.amount > 0 ? '+' : ''}${money(e.amount)}`,
    )
  return [
    `${shopName} — Relevé de ${customerName}`,
    ...rows,
    `Solde à payer : ${money(Math.max(0, balance))}`,
  ].join('\n')
}

/** Lien WhatsApp : uniquement des chiffres normalisés et un texte encodé. Null si le numéro est invalide. */
export function whatsappUrl(phone: string, text: string): string | null {
  const digits = phoneDigits(phone)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null
}

/** Interface prévue pour ajouter l'impression Bluetooth plus tard sans réécrire les écrans. */
export interface PrinterDriver {
  print(data: ReceiptData): Promise<void>
}
export const browserPrinter: PrinterDriver = {
  print: () => {
    window.print()
    return Promise.resolve()
  },
}
