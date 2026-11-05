/**
 * Construit la vitrine en UN SEUL fichier JavaScript autonome.
 *
 * Format `iife` et non `es` : la page publiée inclut le script en ligne, et un
 * module ES ne peut pas être inséré tel quel. Le match enregistré est embarqué
 * dans le bundle, donc la page ne dépend d'aucun réseau une fois chargée.
 */
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@kz/core': r('./packages/core/src/index.ts'),
      '@kz/providers': r('./packages/providers/src/index.ts'),
    },
  },
  build: {
    outDir: r('./dist-showcase'),
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: 'esbuild',
    lib: {
      entry: r('./apps/showcase/main.ts'),
      formats: ['iife'],
      name: 'KZShowcase',
      fileName: () => 'showcase.js',
    },
  },
});
