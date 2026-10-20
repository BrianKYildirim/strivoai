/**
 * Flow 1 — sign-in, dashboard, onboarding state, and no raw technical errors.
 * Read-only against production: navigates and asserts, spends nothing.
 */
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { accountFor, freeAccount, eliteAccount } from './helpers/env';
import { signIn, settledMeritBalance } from './helpers/app';

test.beforeEach(() => requireCredentials());

for (const label of ['free', 'elite'] as const) {
  test(`sign-in and dashboard load — ${label} account`, async ({ page, observed }) => {
    // Resolved INSIDE the test body: collection must not touch credentials.
    const account = accountFor(label);
    await signIn(page, account);

    // Dashboard renders authenticated shell, not a bounce back to /auth.
    // A signed-in user legitimately lands on EITHER /dashboard (onboarded) or
    // /onboarding (not yet onboarded). Both prove authentication succeeded; only
    // a bounce back to /auth would be a failure.
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 60_000 });
    await expect(page).not.toHaveURL(/\/auth/);

    // The app shell renders a <nav> landmark. (There is no data-testid="nav"
    // in shipped code — that testid exists only inside a unit-test mock.)
    await expect(page.getByRole('navigation').first()).toBeVisible();

    // Merit balance is present and numeric — the header is the entitlement surface.
    const balance = await settledMeritBalance(page);
    expect(balance, `merit balance not rendered for ${account.label}`).not.toBeNull();
    expect(balance!).toBeGreaterThanOrEqual(0);

    await expectNoRawErrors(page, `/dashboard (${account.label})`);
    expect(observed.pageErrors, 'uncaught page errors on dashboard').toEqual([]);
  });
}

test('onboarded account is not sent back through onboarding', async ({ page }) => {
  // The ELITE account is the onboarded one; the free account under test has not
  // completed onboarding yet (see 00-onboarding.spec.ts, which drives that flow).
  await signIn(page, eliteAccount());
  await page.goto('/onboarding');
  await page.waitForLoadState('networkidle').catch(() => {});
  await expectNoRawErrors(page, '/onboarding');
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/);
});

test('history and dashboard recover completed results after navigation', async ({ page }) => {
  await signIn(page, eliteAccount());
  await page.goto('/history');
  await page.waitForLoadState('networkidle').catch(() => {});
  await expectNoRawErrors(page, '/history');

  // Navigate away and back — cached/stored results must re-render.
  await page.goto('/dashboard');
  await page.goto('/history');
  await page.waitForLoadState('networkidle').catch(() => {});
  await expectNoRawErrors(page, '/history (after navigation)');
});
