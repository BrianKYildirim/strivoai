import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load the local E2E env (.env.test.local) into process.env so global-setup,
// the specs, AND the `vite build` webServer subprocess all target the TEST
// project. Locally it overrides ambient shell values so a production VITE_*
// target cannot leak into the test build; in CI, explicit secrets keep precedence.
dotenv.config({
  path: '.env.test.local',
  // Local E2E must never inherit an ambient production VITE_* target from the
  // operator shell. CI keeps its explicit secret precedence.
  override: !process.env.CI,
});

/**
 * Playwright E2E runner config (D-03: drives a local `vite preview` production
 * build on :8080, NOT staging). All secret/project values come from the
 * environment at build/run time — NEVER hardcode Supabase/Stripe keys or the
 * test password here. The VITE_* build-time injection lives in Plan 05's
 * `test:e2e` gate step; this config only consumes the already-built preview.
 *
 * The e2e/global-setup.ts, e2e/auth.setup.ts, and the 3 spec files are added in
 * Plan 03 — until then `npx playwright test --list` reports no tests, which is
 * expected and must not be a config-parse error.
 */
/**
 * The cross-device subset tag (Phase 03 · D-02). Playwright matches a project's
 * `grep` against the composed string "<project> <file> <describe> <test> <tags>",
 * so a `@xdev` anywhere in a describe/test title selects the spec. Declared ONCE
 * at module scope and shared by every filtered project so the tag can never drift
 * between projects (a per-project literal is exactly how one engine silently ends
 * up running zero tests and reporting green forever).
 */
const XDEV = /@xdev/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
  },
  // ── Cross-device matrix (Phase 03 · 03-03) ────────────────────────────────
  // D-01: five projects — chromium, firefox, webkit, mobile-webkit (iPhone 14),
  //       mobile-chromium (Pixel 7). All five reuse the SINGLE chromium `setup`
  //       run: Playwright's storage-state file is engine-agnostic JSON
  //       (cookies[] + origins[].localStorage[]), so one login seeds them all.
  // D-02: ONLY `chromium` is unfiltered — it keeps running the full functional
  //       suite. The four added projects carry `grep: XDEV`, so they run the
  //       tagged cross-device subset and nothing else. A ~5x e2e blow-up would
  //       push operators toward `deploy.ps1 -SkipVerify`, which disables the
  //       entire seven-layer precondition; the subset is what keeps the gate
  //       affordable enough to stay switched on.
  // D-28: the two REAL-CHANNEL projects (`edge` → msedge, `chrome-real` →
  //       chrome) are appended ONLY when STRIVO_REAL_CHANNELS === '1'. A
  //       `channel:` project throws at launch where that browser is not
  //       installed (CI Linux, the macOS dev host), so the default posture is
  //       "absent" — the failure mode is "not run", never "red".
  // D-03: no previous-major (N-1) browser is automated and no second Playwright
  //       version is pinned. The support floor is enforced by feature detection;
  //       N-1 is spot-checked in the manual pass (XTEST-04).
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
    },
    {
      name: 'firefox',
      grep: XDEV,
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'], storageState: '.auth/user.json' },
    },
    {
      name: 'webkit',
      grep: XDEV,
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'], storageState: '.auth/user.json' },
    },
    {
      name: 'mobile-webkit',
      grep: XDEV,
      dependencies: ['setup'],
      use: { ...devices['iPhone 14'], storageState: '.auth/user.json' },
    },
    {
      name: 'mobile-chromium',
      grep: XDEV,
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'], storageState: '.auth/user.json' },
    },
    // Opt-in only. Strict equality against '1' matches the repo's fail-closed
    // env convention: anything other than an explicit opt-in means OFF.
    ...(process.env.STRIVO_REAL_CHANNELS === '1'
      ? [
          {
            name: 'edge',
            grep: XDEV,
            dependencies: ['setup'],
            use: {
              ...devices['Desktop Edge'],
              channel: 'msedge',
              storageState: '.auth/user.json',
            },
          },
          {
            name: 'chrome-real',
            grep: XDEV,
            dependencies: ['setup'],
            use: {
              ...devices['Desktop Chrome'],
              channel: 'chrome',
              storageState: '.auth/user.json',
            },
          },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:8080',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      // Pin the browser bundle to the same preview project globalSetup seeds.
      // Values remain process-only and are never written to artifacts.
      VITE_SUPABASE_URL: process.env.SUPABASE_TEST_URL ?? '',
      VITE_SUPABASE_ANON_KEY: process.env.SUPABASE_TEST_ANON_KEY ?? '',
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_TEST_ANON_KEY ?? '',
    },
  },
});
