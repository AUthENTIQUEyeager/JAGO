import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
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
  plugins: [
    react(),
    brandHtml(),
    VitePWA({
      strategies: 'generateSW',
      // Mise à jour sur demande (jamais en pleine vente) ; enregistrement par un fichier externe : aucun script inline (CSP).
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: brand.name,
        short_name: brand.name,
        description: brand.description,
        lang: 'fr',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        theme_color: brand.colors.themeColor,
        background_color: brand.colors.backgroundColor,
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Précache de l'application seulement. AUCUN cache d'API ni de réponses authentifiées : les données vivent dans Dexie.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
      },
    }),
  ],
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
