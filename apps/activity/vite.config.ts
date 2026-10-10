import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // CSP forbids inline resources (and the font/img policies are strict): never inline assets.
    assetsInlineLimit: 0,
  },
  server: {
    // `pnpm dev` in apps/worker serves the API on 8787.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
