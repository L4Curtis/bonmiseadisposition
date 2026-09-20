import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, STORAGE_STATE_PATH } from './tests/helpers/env';

/**
 * Suite E2E — voir docs/testing-guide.md (section E2E) pour le lancement en
 * local et la lecture d'un échec en CI.
 *
 * Exécution volontairement séquentielle (fullyParallel: false, workers: 1) :
 * les tests créent leurs propres données (collaborateurs, bons — voir
 * tests/helpers/), mais partagent la même boîte mailpit et le même compte
 * admin authentifié (session enregistrée par le projet "setup"). Les
 * enchaîner en série élimine toute question de correspondance email ↔ test
 * ou de comptage de requêtes, sans réel coût : la suite reste courte.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  // 120s : le test 5 (restitution → PV → archivage) enchaîne deux allers-
  // retours mailpit, chacun potentiellement soumis à un délai de livraison
  // SMTP (voir waitForEmailTo) — large marge pour rester stable même sous
  // charge (poste de développement partagé).
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    // Captures et trace uniquement en cas d'échec (voir brief) : inutile
    // d'alourdir chaque exécution verte.
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE_PATH,
      },
      dependencies: ['setup'],
      testMatch: /.*\.spec\.ts/,
    },
  ],
});
