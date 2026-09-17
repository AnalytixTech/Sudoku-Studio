import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      VitePWA({
        // 'prompt', not 'autoUpdate': the current puzzle lives in React state,
        // so a silent reload mid-game would throw away the player's board.
        // UpdatePrompt lets them choose when to take the new version.
        registerType: 'prompt',
        injectRegister: false, // registered explicitly via useRegisterSW
        includeAssets: ['favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Sudoku Studio: Arena & Solver',
          short_name: 'Sudoku Studio',
          description:
            'Sudoku across eight grid variants with daily challenges, 1v1 battles, a photo solver, and a step-by-step logic explainer.',
          theme_color: '#0b0f19',
          background_color: '#0b0f19',
          display: 'standalone',
          orientation: 'any',
          categories: ['games', 'puzzle', 'education'],
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            // Separate maskable entry: Android crops to its own shape, and a
            // rounded tile would get its corners clipped twice.
            {
              src: 'pwa-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // Single-page app: any route serves the shell, so ?room= links work offline.
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Brand fonts (Orbitron/Outfit) are loaded from Google Fonts.
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-css' },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-files',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // tesseract.js pulls its wasm core and language data at runtime;
              // caching them makes the photo solver work offline after one use.
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tesseract-core',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/tessdata\.projectnaptha\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'tesseract-lang',
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: {
          // Off by default so `npm run dev` isn't serving cached assets while
          // you edit. Flip to true to debug the service worker itself.
          enabled: false,
        },
      }),
    ],
    base: env.VITE_BASE_URL || env.BASE_URL || '/',
    server: {
      port: 5173,
    },
  }
})
