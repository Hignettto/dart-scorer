/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// On GitHub Pages the app lives at https://<user>.github.io/<repo>/,
// so the deploy workflow sets BASE_PATH=/<repo>/. Locally it is just "/".
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    // Makes the app installable ("Add to Home Screen") and work offline.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Darts Scorer',
        short_name: 'Darts',
        description: 'Score darts games and track stats per player.',
        theme_color: '#111418',
        background_color: '#111418',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
