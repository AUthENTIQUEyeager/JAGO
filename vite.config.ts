import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { brand } from './src/config/brand.ts'

/** Injecte le nom et les couleurs de la marque dans index.html (un seul endroit : brand.ts). */
function brandHtml(): Plugin {
  return {
    name: 'jago-brand-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) =>
        html
          .replaceAll('%BRAND_NAME%', brand.name)
          .replaceAll('%BRAND_DESCRIPTION%', brand.description)
          .replaceAll('%BRAND_THEME_COLOR%', brand.colors.themeColor),
    },
  }
}

export default defineConfig({
  plugins: [react(), brandHtml()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: { sourcemap: false },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    css: false,
  },
})
