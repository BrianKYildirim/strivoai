import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

/**
 * PRODUCTION smoke-test runner config.
 *
 * Deliberately SEPARATE from playwright.config.ts:
 *   - testDir is ./e2e-prod, so `npm run test:e2e` (testDir ./e2e) and the
 *     blocking `verify:baseline` gate never pick these specs up.
 *   - no webServer: this drives the LIVE deployed site, it does not build one.
 *   - no .env.test.local: that file pins the PREVIEW project and would clobber
 *     the production credentials with preview ones.
 *
 * SAFETY INVARIANTS (do not relax without understanding the cost):
 *   - retries: 0        — a retry would re-run a real analysis, creating a
 *                         SECOND job and a SECOND merit charge on a real
 *                         account. That would both cost money and destroy the
 *                         "one job / one charge per attempt" evidence.
 *   - workers: 1        — serial execution keeps job/charge attribution
 *                         unambiguous and keeps us far below anything that
 *                         could look like load traffic.
 *   - fullyParallel: false
 *
 * CREDENTIALS: read from process.env only (PROD_FREE_EMAIL / PROD_FREE_PASSWORD /
 * PROD_ELITE_EMAIL / PROD_ELITE_PASSWORD). Optionally sourced from a gitignored
 * .env.prod-smoke.local. Never hardcoded, never logged, never committed.
 */
dotenv.config({ path: '.env.prod-smoke.local' });

const BASE_URL = process.env.PROD_BASE_URL ?? 'https://strivoai.net';

export default defineConfig({
  testDir: './e2e-prod',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // Report lands inside the already-gitignored test-results/ tree so no run
  // artifact can be accidentally committed.
  reporter: [['list'], ['json', { outputFile: 'test-results/prod-smoke/results.json' }]],
  outputDir: 'test-results/prod-smoke',
  use: {
    baseURL: BASE_URL,
    // Screenshots/video are captured manually and MASKED in observe.ts.
    // Automatic capture is off so no unmasked credential frame is ever written.
    screenshot: 'off',
    video: 'off',
    trace: 'off',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [
    { name: 'prod-smoke', use: { ...devices['Desktop Chrome'] } },
  ],
});
