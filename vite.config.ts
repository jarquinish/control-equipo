/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// BASE_PATH permite publicar la app en un subdirectorio (p. ej. /alignment/).
const base = process.env.BASE_PATH ?? '/';

// `--mode single`: un solo HTML autocontenido (vista previa / uso sin servidor).
/** Carga `config.js` (configuración editable al publicar) antes de la app. */
const runtimeConfig = (): Plugin => ({
  name: 'au-runtime-config',
  transformIndexHtml: () => [{ tag: 'script', attrs: { src: `${base.endsWith('/') ? base : `${base}/`}config.js` }, injectTo: 'head' }],
});

// `--mode hubspot`: igual, pero conectada a Supabase (plantilla de página de HubSpot, ver docs/HUBSPOT.md).
const singleFile = (mode: string) => mode === 'single' || mode === 'hubspot';

export default defineConfig(({ mode }) => ({
  base: singleFile(mode) ? './' : base,
  plugins: singleFile(mode) ? [react(), viteSingleFile()] : [react(), runtimeConfig()],
  // La versión de un solo archivo no usa archivos públicos (config.js, _redirects…).
  publicDir: singleFile(mode) ? false : 'public',
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
}));
