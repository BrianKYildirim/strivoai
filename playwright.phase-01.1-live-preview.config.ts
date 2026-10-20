import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test.local', override: !process.env.CI });

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium-live-preview',
      dependencies: ['setup'],
      testMatch: /phase-01\.1-live-preview[\\/].*\.live\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:8080',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_SUPABASE_URL: process.env.SUPABASE_TEST_URL ?? '',
      VITE_SUPABASE_ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_ANON_KEY ?? '',
    },
  },
});
