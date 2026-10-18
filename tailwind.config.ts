import type { Config } from 'tailwindcss'
import { brand } from './src/config/brand.ts'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: brand.colors.primary,
        accent: brand.colors.accent,
        surface: brand.colors.surface,
      },
    },
  },
  plugins: [],
} satisfies Config
