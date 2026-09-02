import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// An installed app only re-reads its icons when the manifest itself changes,
// and the icon filenames never do — so a new mark would sit on the server
// while every phone and taskbar kept the old one until it was reinstalled.
// Stamping each icon with a hash of its own bytes is what makes a redeploy
// enough: the URL moves, the manifest differs, and the install updates itself.
function stamped(file: string) {
  const bytes = readFileSync(path.resolve(__dirname, 'public', file))
  return `${file}?v=${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`
}

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
          { src: stamped('pwa-48.png'), sizes: '48x48', type: 'image/png' },
          { src: stamped('pwa-64.png'), sizes: '64x64', type: 'image/png' },
          { src: stamped('pwa-96.png'), sizes: '96x96', type: 'image/png' },
          { src: stamped('pwa-128.png'), sizes: '128x128', type: 'image/png' },
          { src: stamped('pwa-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: stamped('pwa-256.png'), sizes: '256x256', type: 'image/png' },
          { src: stamped('pwa-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: stamped('pwa-maskable-512.png'),
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
    // Not the default 'assets': the app has its own /assets route, and a
    // bundle directory of that name shadows every /assets/* URL on a reload.
    // internal/web/web.go has to agree with whatever this says.
    assetsDir: 'static',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
