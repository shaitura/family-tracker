import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execFileSync } from 'child_process'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Injected into the bundle so the Admin diagnostic panel can state which build
// the browser is actually running. Derived from git at build time — a
// hand-maintained version string goes stale and then lies about the one thing
// this is for.
const BUILD_ID = (() => {
  let sha = 'nogit'
  // execFileSync, not execSync: no shell, args passed as an array.
  try { sha = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim() } catch { /* not a checkout */ }
  return `${sha} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`
})()

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
  server: {
    host: true,
    allowedHosts: 'all',
  },
})
