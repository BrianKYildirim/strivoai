/**
 * Flow 7 — Access control.
 *
 *   - Elite users get Elite access (feature gates unlocked)
 *   - Free users are gated, not broken
 *   - Neither Free nor Elite can see or reach the admin panel
 *
 * Admin gating is server-side via the has_role() SECURITY DEFINER RPC
 * (src/pages/AdminUsage.tsx). Production currently holds exactly ONE admin row.
 * A tier upgrade must never mint an admin.
 */
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { accountFor, freeAccount, eliteAccount } from './helpers/env';
import { signIn } from './helpers/app';

test.beforeEach(() => requireCredentials());

test('Elite account receives Elite access', async ({ page }) => {
  await signIn(page, eliteAccount());
  await page.goto('/career-compass');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Elite must not be shown the locked gate.
  const locked = page.locator('[data-testid="elite-feature-gate-locked"]');
  expect(await locked.count(), 'Elite account is seeing a LOCKED Elite feature gate').toBe(0);

  await expectNoRawErrors(page, '/career-compass (elite)');
});

test('Free account is gated cleanly, not broken', async ({ page }) => {
  await signIn(page, freeAccount());
  await page.goto('/career-compass');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Whatever the gate decision is, it must be presented in product language.
  await expectNoRawErrors(page, '/career-compass (free)');
});

for (const label of ['free', 'elite'] as const) {
  test(`admin panel is unreachable for the ${label} account`, async ({ page }) => {
    // Resolved INSIDE the test body: collection must not touch credentials.
    const account = accountFor(label);
    await signIn(page, account);

    // Direct navigation must be refused — this is the real authorisation test.
    await page.goto('/admin/usage');
    await page.waitForLoadState('networkidle').catch(() => {});

    // AdminUsage.tsx redirects non-admins to /dashboard with a denial toast.
    await expect(
      page,
      `${account.label} account was NOT redirected away from /admin/usage`,
    ).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Admin-only data must not have rendered at any point.
    const body = await page.locator('body').innerText().catch(() => '');
    expect(
      /upgrade requests|admin usage|all users/i.test(body),
      `admin-only content leaked to the ${account.label} account`,
    ).toBe(false);

    await expectNoRawErrors(page, `/admin/usage (${account.label})`);
  });

  test(`admin navigation entry is hidden from the ${label} account`, async ({ page }) => {
    await signIn(page, accountFor(label));
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle').catch(() => {});

    const adminLink = page.getByRole('link', { name: /admin/i });
    expect(
      await adminLink.count(),
      `an admin nav entry is visible to the ${label} account`,
    ).toBe(0);
  });
}
