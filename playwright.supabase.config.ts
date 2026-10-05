import { defineConfig, devices } from '@playwright/test';
// @ts-expect-error módulo JS de la pila de pruebas
import { ANON_KEY } from './supabase/tests/stack.mjs';

/**
 * E2E multiusuario contra la pila local tipo Supabase (PostgreSQL + PostgREST + auth simulado).
 * Requiere binarios de PostgreSQL y POSTGREST_BIN. Ver README → Supabase → Pruebas.
 */
const env = `VITE_STORAGE=supabase VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=${ANON_KEY as string}`;

export default defineConfig({
  testDir: './tests/e2e-supabase',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4174', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: 'node supabase/tests/stack.mjs', url: 'http://localhost:54321/auth/v1/user', reuseExistingServer: false, timeout: 60_000 },
    {
      command: `${env} npx vite build --outDir dist-supabase && npx vite preview --outDir dist-supabase --port 4174`,
      url: 'http://localhost:4174',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
