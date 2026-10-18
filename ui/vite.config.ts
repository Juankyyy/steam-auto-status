import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// App version: single source of truth is tauri.conf.json (the release workflow
// sets it from the git tag via scripts/set-version.mjs), injected at build time.
const tauriConf = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../src-tauri/tauri.conf.json'), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(tauriConf.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // Config recommended by Tauri for the dev server
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
})
