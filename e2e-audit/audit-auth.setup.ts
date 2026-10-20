/**
 * Release-readiness audit — authenticate BOTH audit users and persist storage state.
 * Drives the real /auth login form (no service-role key in browser context).
 */
import { test as setup, expect } from '@playwright/test';

const USERS = [
  { email: 'audit+free@strivo.test', file: '.auth/audit-free.json', tier: 'free' },
  { email: 'audit+elite@strivo.test', file: '.auth/audit-elite.json', tier: 'elite' },
];

for (const u of USERS) {
  setup(`authenticate ${u.tier}`, async ({ page }) => {
    const password = process.env.E2E_TEST_PASSWORD;
    expect(password, 'E2E_TEST_PASSWORD must be set').toBeTruthy();

    await page.goto('/auth');
    await page.locator('#email').fill(u.email);
    await page.locator('#password').fill(password as string);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });

    // Both audit users are fully onboarded (resume row + career_targets goal), so
    // ProtectedRoute must settle on /dashboard rather than bouncing to /onboarding.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.context().storageState({ path: u.file });
  });
}
