/**
 * Release-readiness audit — dedicated Playwright config.
 *
 * SEPARATE from playwright.config.ts on purpose: the baseline suite is the merge gate
 * and must not be perturbed by audit-only projects/fixtures. This config drives the same
 * local production build (vite build + vite preview on :8080) against the PREVIEW Supabase
 * backend, but authenticates TWO users — the Free and Elite audit accounts — and runs the
 * tier-matrix sweep against both.
 */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test.local' });

export default defineConfig({
  testDir: './e2e-audit',
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /audit-auth\.setup\.ts/ },
    {
      name: 'free',
      dependencies: ['setup'],
      testMatch: /.*\.audit\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: '.auth/audit-free.json' },
    },
    {
      name: 'elite',
      dependencies: ['setup'],
      testMatch: /.*\.audit\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: '.auth/audit-elite.json' },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
