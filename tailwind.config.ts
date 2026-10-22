import plugin from 'tailwindcss/plugin'
import type { Config } from 'tailwindcss'
import { brand } from './src/config/brand.ts'
import { hexToTriplet, THEME_STEPS } from './src/config/theme.ts'

/** Échelle de couleur lue dans des variables CSS : la boutique peut les remplacer sans recompiler (voir applyTheme). */
const scale = (prefix: string) =>
  Object.fromEntries(
    THEME_STEPS.map((step) => [step, `rgb(var(--${prefix}-${step}) / <alpha-value>)`]),
  )

/** Valeurs par défaut des variables = les couleurs de brand.ts. */
const defaults = plugin((api) => {
  const vars: Record<string, string> = {}
  for (const step of THEME_STEPS) {
    vars[`--brand-${step}`] = hexToTriplet(brand.colors.primary[step])
    vars[`--accent-${step}`] = hexToTriplet(brand.colors.accent[step])
  }
  api.addBase({ ':root': vars })
})

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: scale('brand'),
        accent: scale('accent'),
        surface: brand.colors.surface,
      },
    },
  },
  plugins: [defaults],
} satisfies Config
