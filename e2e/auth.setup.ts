/**
 * Playwright auth setup project (Plan 01-03, Task 1).
 *
 * Drives the REAL email/password login form (src/pages/Auth.tsx — login mode is
 * the default; #email + #password Inputs, "Sign In" submit) against the local
 * vite preview pointed at the Supabase TEST project, then persists the
 * authenticated browser context to .auth/user.json. The 3 spec projects reuse
 * that storage state (playwright.config.ts chromium project) so they start
 * already logged in — the canonical Playwright pattern (no per-test login).
 *
 * SECURITY: no service-role key here. Only the operator-chosen E2E_TEST_PASSWORD
 * and the seeded email are used to drive the public login form. No secret value
 * is hardcoded; the password is read from process.env.
 *
 * The seeded user (e2e/global-setup.ts) has an onboarded resume row, so a
 * successful login settles on an authenticated app route (not /auth, not
 * /onboarding). We assert the authenticated dashboard explicitly.
 */
import { test as setup, expect } from '@playwright/test';
import { E2E_TEST_EMAIL } from './global-setup';

const AUTH_FILE = '.auth/user.json';

setup('authenticate', async ({ page }) => {
  const password = process.env.E2E_TEST_PASSWORD;
  expect(
    password,
    'E2E_TEST_PASSWORD must be set (.env.test.local locally / CI secret)',
  ).toBeTruthy();

  await page.goto('/auth');

  // Login mode is the default authMode; the email/password form is rendered.
  await page.locator('#email').fill(E2E_TEST_EMAIL);
  await page.locator('#password').fill(password as string);
  const [tokenResponse] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes('/auth/v1/token') &&
      response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Sign In', exact: true }).click(),
  ]);
  const tokenBody = await tokenResponse.json().catch(() => ({})) as {
    error?: string;
    error_code?: string;
  };
  expect(
    tokenResponse.status(),
    `preview password authentication (${new URL(tokenResponse.url()).hostname}; ${tokenBody.error_code ?? tokenBody.error ?? 'no-code'})`,
  ).toBe(200);

  // The 200 response persists the session before signInWithPassword resolves.
  // Navigate explicitly instead of racing Auth.tsx's async SIGNED_IN listener,
  // which also performs an onboarding query before it redirects.
  await page.goto('/dashboard');
  // ProtectedRoute resolves the session and renders Dashboard (does NOT bounce
  // to /auth or /onboarding) because the seeded user has a resume row.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
