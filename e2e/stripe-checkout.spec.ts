/**
 * Flow 3 — Stripe checkout, real test mode (TEST-04, D-04).
 *
 * Operator decision (Task 3a): `integration-proven`. The BLOCKING per-PR
 * assertions are exactly three — they prove OUR plumbing against real Stripe
 * test mode without depending on Stripe's anti-automation-protected card form
 * (01-RESEARCH.md Pitfall 4):
 *   1. create-checkout-session returns a real test-mode clientSecret.
 *   2. The EmbeddedCheckout iframe mounts/renders.
 *   3. The post-checkout reconcile path fires (?checkout=complete →
 *      reconcileTierUpgrade, mirroring Dashboard.test.tsx lines 97-117).
 *
 * The automated 4242 card SUBMIT is QUARANTINE-ELIGIBLE: it is tagged
 * QUARANTINE and kept OUT of the blocking set (test.skip) because Stripe's
 * embedded Payment Element documents anti-automation that makes a card-submit
 * CI-flaky (D-06 must stay deterministic; D-07 forbids retry-masking).
 *
 * No service-role key; storage state provides the authed context. The clientSecret
 * comes from the REAL create-checkout-session call (Stripe test mode) — not mocked.
 */
import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/user.json' });

test.describe('Stripe checkout (real test mode) — integration-proven blocking set', () => {
  test('clientSecret round-trip + EmbeddedCheckout iframe mounts', async ({ page }) => {
    await page.goto('/pricing');

    // Capture the REAL create-checkout-session response (Stripe test mode) so we
    // can assert a non-null clientSecret came back over the wire.
    const checkoutResponse = page.waitForResponse(
      (res) => res.url().includes('/functions/v1/create-checkout-session'),
      { timeout: 30_000 },
    );

    // Initiate checkout via the Elite tier CTA (Pricing.tsx → create-checkout-session).
    await page.getByRole('button', { name: /upgrade to elite/i }).first().click();

    // (1) clientSecret round-trip: the function returns a test-mode clientSecret.
    const res = await checkoutResponse;
    expect(res.ok()).toBeTruthy();
    const payload = await res.json();
    expect(payload?.clientSecret, 'create-checkout-session must return a clientSecret').toBeTruthy();
    expect(String(payload.clientSecret)).toMatch(/_secret_/); // Stripe clientSecret shape

    // (2) EmbeddedCheckout iframe mounts inside the checkout dialog. Scope to the
    // "Subscribe to …" dialog (StripeCheckoutWrapper renders <EmbeddedCheckout/>
    // inside a Dialog titled `Subscribe to ${tier}`) and assert its embedded
    // iframe renders. This is robust to Stripe's internal iframe name/src/title —
    // the prior hardcoded selectors never matched the real EmbeddedCheckout iframe
    // (this assertion only began running once the clientSecret round-trip succeeded).
    const checkoutDialog = page.getByRole('dialog', { name: /subscribe to/i });
    await expect(checkoutDialog.locator('iframe').first()).toBeVisible({ timeout: 30_000 });
  });

  test('post-checkout reconcile fires on ?checkout=complete', async ({ page }) => {
    // (3) The reconcile path: landing on the dashboard with ?checkout=complete runs
    // the mount effect that calls reconcileTierUpgrade() and then strips the checkout
    // param via replace navigation (Dashboard.tsx). We assert the DETERMINISTIC,
    // DURABLE outcome — the param being cleaned from the URL — NOT the transient
    // "Upgrade processing" toast.
    //
    // Why not the toast: the toast fires on mount and auto-dismisses within a few
    // seconds, so `getByText(...).toBeVisible()` races its lifetime and flaked the
    // deploy gate (element-not-found: the toast had already come and gone). The param
    // strip is emitted by the SAME synchronous effect body, immediately AFTER the
    // reconcileTierUpgrade() call — so the URL no longer carrying `checkout=complete`
    // proves the reconcile path executed. The toast itself is covered deterministically
    // by Dashboard.test.tsx (unit): fires once on mount, reconcile called once, param
    // stripped with { replace: true }. This keeps blocking proof (3) without the race
    // (D-07: fixes the fragility at its source, not retry-masking).
    await page.goto('/dashboard?checkout=complete');

    await expect(page).toHaveURL(/\/dashboard(?!.*checkout=complete)/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/checkout=complete/);
  });

  // QUARANTINE(TEST-04-stripe-card-submit, owner: testing-strategy, 2026-06-09):
  // The full 4242 card-fill + submit happy path is quarantine-eligible per the
  // Task 3a `integration-proven` decision — Stripe's embedded Payment Element
  // has documented anti-automation (01-RESEARCH.md Pitfall 4) that makes a
  // card-submit CI-flaky. It is EXCLUDED from the blocking gate (test.skip) and
  // tracked in TESTING-STRATEGY.md's quarantine register; the three assertions
  // above are the deterministic blocking proof. Uses only the 4242 test card.
  test.skip('QUARANTINE: 4242 card-fill + submit completes checkout', async ({ page }) => {
    await page.goto('/pricing');
    await page.getByRole('button', { name: /upgrade to elite/i }).first().click();

    const cardFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]');
    await cardFrame.getByPlaceholder('Card number').fill('4242 4242 4242 4242');
    await cardFrame.getByPlaceholder('MM / YY').fill('12 / 34');
    await cardFrame.getByPlaceholder('CVC').fill('123');
    await page.getByRole('button', { name: /pay|subscribe/i }).click();

    await expect(page).toHaveURL(/checkout=complete/, { timeout: 30_000 });
  });
});
