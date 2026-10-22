import { brand } from './brand'
import { buildScale, isValidHex, THEME_STEPS, type ThemeChoice } from './theme'

const PREFIXES = { primary: 'brand', accent: 'accent' } as const

/**
 * Applique les couleurs choisies par la boutique (variables CSS sur <html>) et la couleur de la barre du navigateur.
 * Sans choix valide, on retire les variables : les couleurs d'origine de brand.ts reviennent.
 */
export function applyTheme(theme: ThemeChoice | null | undefined): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  for (const key of ['primary', 'accent'] as const) {
    const hex = theme?.[key]
    const prefix = PREFIXES[key]
    if (isValidHex(hex)) {
      const scale = buildScale(hex)
      for (const step of THEME_STEPS) root.style.setProperty(`--${prefix}-${step}`, scale[step])
    } else {
      for (const step of THEME_STEPS) root.style.removeProperty(`--${prefix}-${step}`)
    }
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  const primary = theme?.primary
  meta?.setAttribute('content', isValidHex(primary) ? primary : brand.colors.themeColor)
}
