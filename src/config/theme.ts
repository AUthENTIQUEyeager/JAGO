/**
 * Couleurs personnalisables du logiciel. Aucune dépendance au navigateur ni à l'alias « @ » :
 * ce fichier est aussi lu par tailwind.config.ts.
 *
 * Tailwind lit les couleurs `brand-*` et `accent-*` dans des variables CSS (--brand-700, --accent-400…).
 * Par défaut elles viennent de brand.ts ; le choix d'une boutique les remplace à l'exécution.
 */
export const THEME_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
export type ThemeStep = (typeof THEME_STEPS)[number]
export type Palette = Record<ThemeStep, string>

export interface ThemeChoice {
  primary?: string
  accent?: string
}

export const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** Couleurs proposées en un clic (le vert d'origine = aucun choix enregistré). */
export const PRIMARY_PRESETS = [
  { name: 'Vert', hex: null },
  { name: 'Bleu', hex: '#1d4ed8' },
  { name: 'Turquoise', hex: '#0f766e' },
  { name: 'Violet', hex: '#7c3aed' },
  { name: 'Rose', hex: '#be185d' },
  { name: 'Rouge', hex: '#b91c1c' },
  { name: 'Orange', hex: '#c2410c' },
  { name: 'Ardoise', hex: '#334155' },
] as const

export const ACCENT_PRESETS = [
  { name: 'Ambre', hex: null },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Jaune', hex: '#facc15' },
  { name: 'Rose', hex: '#ec4899' },
  { name: 'Bleu ciel', hex: '#38bdf8' },
  { name: 'Citron vert', hex: '#a3e635' },
] as const

// Luminosité (en %) de chaque nuance : 50 très clair → 900 très foncé. Le texte blanc reste lisible sur 700 et plus.
const LIGHTNESS: Record<ThemeStep, number> = {
  50: 96,
  100: 92,
  200: 84,
  300: 74,
  400: 62,
  500: 50,
  600: 40,
  700: 32,
  800: 26,
  900: 21,
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** « #155c43 » → « 21 92 67 » (format attendu par rgb(var(--x) / <alpha-value>)). */
export function hexToTriplet(hex: string): string {
  return hexToRgb(hex).join(' ')
}

function rgbToHs(r: number, g: number, b: number): { h: number; s: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0 }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  return { h: (h * 60 + 360) % 360, s }
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** Construit les 10 nuances (triplets RGB) d'une couleur : on garde sa teinte et son intensité. */
export function buildScale(hex: string): Record<ThemeStep, string> {
  const [r, g, b] = hexToRgb(hex)
  const { h, s } = rgbToHs(r, g, b)
  const sat = Math.min(0.85, Math.max(0.3, s))
  const out = {} as Record<ThemeStep, string>
  for (const step of THEME_STEPS) {
    const light = LIGHTNESS[step] / 100
    // Les nuances très claires sont un peu moins saturées pour rester douces.
    const factor = step <= 100 ? 0.75 : 1
    out[step] = hslToRgb(h, sat * factor, light).join(' ')
  }
  return out
}

export function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value)
}
