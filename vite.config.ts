import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // GitHub Pages project sites live under /REPOSITORY/. CI sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022', rollupOptions: { input: { main: r('./index.html') } } },
  test: { include: ['tests/**/*.test.ts'] },
});
