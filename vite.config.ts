// vite.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Budget Tracker',
        short_name: 'Budget',
        description: 'Personal weekly budget tracker',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
    }),
  ],
  // Only scan the real app entry for dependency pre-bundling. Without this, Vite
  // also crawls generated artifacts like graphify-out/solar-system.html (the 3D
  // "Code Galaxy" viz), which imports three.js — not an app dependency — and the
  // scan fails noisily even though the dev server runs fine.
  optimizeDeps: {
    entries: ['index.html'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    pool: 'threads',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/.worktrees/**',
      '**/.claude/worktrees/**',
    ],
  },
})
