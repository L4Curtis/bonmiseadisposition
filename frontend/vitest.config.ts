import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Config dédiée aux tests (séparée de vite.config.ts pour éviter le conflit de
// types entre le vite racine et celui embarqué par vitest). Non typée par le
// build de production (tsconfig.node.json n'inclut que vite.config.ts).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
