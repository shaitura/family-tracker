import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const root = path.resolve(__dirname, '..');

export default defineConfig({
  root,
  define: { __BUILD_ID__: JSON.stringify('harness') },
  plugins: [react()],
  resolve: {
    alias: [
      // Exact-match first: swap only the data hook, leave every other '@/...' real.
      { find: /^@\/hooks\/useTransactions$/, replacement: path.resolve(root, 'harness/useTransactions.ts') },
      { find: '@', replacement: path.resolve(root, 'src') },
    ],
  },
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
});
