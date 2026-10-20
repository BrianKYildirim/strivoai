import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/phase-01.1-local',
  testMatch: '**/*.local.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium-local',
    use: { ...devices['Desktop Chrome'] },
  }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:8080',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
