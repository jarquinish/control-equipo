/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH permite publicar la app en un subdirectorio (p. ej. /alignment/).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: { port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/setup.ts'],
  },
});
