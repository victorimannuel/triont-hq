import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The bundle is compiled straight into the Go binary's embed directory, so a
// production deploy is one file with no separate web server for static assets.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'HQ',
        short_name: 'HQ',
        description: 'Project, link, dan credential dalam satu tempat.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // No orientation lock: this is installed on a laptop as often as a
        // phone, and locking it to portrait is a mobile-only assumption.
        background_color: '#f6f7f9',
        theme_color: '#2f5fd8',
        icons: [
          // Exact sizes rather than two big ones: Windows picks from this list
          // to build the shortcut icon, and picking beats downscaling.
          { src: 'pwa-48.png', sizes: '48x48', type: 'image/png' },
          { src: 'pwa-64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-96.png', sizes: '96x96', type: 'image/png' },
          { src: 'pwa-128.png', sizes: '128x128', type: 'image/png' },
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-256.png', sizes: '256x256', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // The worker is written by hand (src/sw.ts) rather than generated: a
      // generated one has nowhere to put the push and notificationclick
      // handlers. Precaching and the navigation fallback live in there too.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../internal/web/dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
