/**
 * Flow 1 — Auth/session persistence (TEST-04, D-04).
 *
 * Proves the REAL Supabase session path: a logged-in user (storageState from the
 * auth setup project) lands on /dashboard, and AFTER a full page reload stays
 * authenticated — no bounce to /auth. This exercises the genuine
 * persistSession:true / autoRefreshToken:true localStorage path in
 * src/lib/supabaseClient.ts and the ProtectedRoute session resolution. Only
 * Anthropic is stubbed (server-side, on the TEST project) — auth here is 100% real.
 *
 * No Anthropic mock and no AI_TEST_MODE reference: this flow does not touch AI.
 * No service-role key: storage state was minted by the setup project.
 */
import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/user.json' });

test('session persists across a full page reload (no /auth redirect)', async ({ page }) => {
  await page.goto('/dashboard');

  // Authenticated UI is present (ProtectedRoute rendered Dashboard, not the
  // loading spinner / /auth gate). "Your Career OS" is the dashboard hero h1.
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole('heading', { name: /your career os/i }),
  ).toBeVisible({ timeout: 30_000 });

  // The real persistence proof: hard reload re-reads the session from
  // localStorage and re-resolves the route. A broken session would bounce to /auth.
  await page.reload();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/auth/);
  await expect(
    page.getByRole('heading', { name: /your career os/i }),
  ).toBeVisible({ timeout: 30_000 });
});
