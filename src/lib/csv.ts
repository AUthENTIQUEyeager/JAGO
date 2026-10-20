/** Neutralise l'injection de formules : un texte commençant par = + - @ tab ou retour est préfixé d'une apostrophe. */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? neutralizeFormula(value) : String(value)
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV compatible Excel : séparateur « ; », BOM UTF-8, lignes CRLF. */
export function toCsv(
  header: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | boolean | null | undefined>>,
): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(';'))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export const CSV_LIMITS = { maxBytes: 5 * 1024 * 1024, maxRows: 10_000 } as const

/** Lecture CSV (guillemets, « ; » ou « , » détecté). Ne fait que lire du texte, rien n'est exécuté. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charAt(i)
    if (quoted) {
      if (ch === '"' && clean.charAt(i + 1) === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean.charAt(i + 1) === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  return rows
}
