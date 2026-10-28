import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';

const root = path.resolve(__dirname, '..');

export default defineConfig({
  root,
  // Tailwind resolves its config and content globs from process.cwd(); pin both
  // to the repo so the harness is styled no matter where it is launched from.
  css: {
    postcss: {
      plugins: [
        tailwindcss({ ...tailwindConfig, content: [path.join(root, 'src/**/*.{ts,tsx}'), path.join(root, 'harness/**/*.{ts,tsx,html}')] }),
        autoprefixer(),
      ],
    },
  },
  define: { __BUILD_ID__: JSON.stringify('harness') },
  plugins: [react()],
  resolve: {
    alias: [
      // Exact-match first: swap only the data hook, leave every other '@/...' real.
      { find: /^@\/hooks\/useTransactions$/, replacement: path.resolve(root, 'harness/useTransactions.ts') },
      // base44Client imports it relatively ('./firebase'), so match both spellings.
      { find: /^(@\/lib|\.)\/firebase$/, replacement: path.resolve(root, 'harness/firebase.ts') },
      { find: '@', replacement: path.resolve(root, 'src') },
    ],
  },
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
});
