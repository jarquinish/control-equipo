import { defineConfig, devices } from '@playwright/test';
// @ts-expect-error módulo JS de la pila de pruebas
import { ANON_KEY } from './supabase/tests/stack.mjs';

/**
 * E2E de la plantilla de HubSpot (un solo archivo, rutas con #) contra la pila local
 * tipo Supabase. La página se genera como la entregaría HubSpot (ver scripts/hubspot-render-test.mjs).
 */
export default defineConfig({
  testDir: './tests/e2e-hubspot',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4175', viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: 'node supabase/tests/stack.mjs', url: 'http://localhost:54321/auth/v1/user', reuseExistingServer: false, timeout: 60_000 },
    {
      command: `npm run build:hubspot && node scripts/hubspot-render-test.mjs http://localhost:54321 ${ANON_KEY as string} && npx vite preview --outDir dist-hubspot-test --port 4175`,
      url: 'http://localhost:4175',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
