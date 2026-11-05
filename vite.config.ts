import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Deux pages : l'overlay (source navigateur OBS) et la régie.
 * Le serveur temps réel tourne à part sur 4100 ; on lui proxifie /api et /ws.
 */
export default defineConfig({
  root: r('./apps'),
  resolve: {
    alias: {
      '@kz/core': r('./packages/core/src/index.ts'),
      '@kz/providers': r('./packages/providers/src/index.ts'),
    },
  },
  server: {
    port: 4000,
    proxy: {
      '/api': 'http://localhost:4100',
      '/ws': { target: 'ws://localhost:4100', ws: true },
    },
  },
  build: {
    outDir: r('./dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        overlay: r('./apps/overlay/index.html'),
        regie: r('./apps/regie/index.html'),
        preview: r('./apps/preview/index.html'),
      },
    },
  },
});
