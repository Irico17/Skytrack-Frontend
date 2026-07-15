import { defineConfig, devices } from '@playwright/test';

/**
 * Config de Playwright para el ensayo E2E de la prueba "Operaciones día a día".
 *
 * NO levanta el frontend ni el backend automáticamente (el backend corre en un
 * contenedor Podman aparte, no algo que Playwright pueda orquestar). Antes de correr:
 *   1. Backend:  contenedor sky-d2d (o el que sea) arriba, con datos limpios.
 *   2. Frontend: `npm run dev` con VITE_API_BASE apuntando a ese backend
 *      (ver .claude/launch.json, config "skytrack-frontend-dev").
 *   3. Correr:   npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 60 * 1000, // la prueba real espera varios ciclos del backend (Sa=5min) — 30 min de margen
  expect: { timeout: 15_000 },
  fullyParallel: false, // el escenario es UN solo flujo secuencial con contextos internos paralelos
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
