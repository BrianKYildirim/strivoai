/**
 * Flow 6 — Checkout dialogs. STOPS BEFORE PAYMENT.
 *
 * Verifies:
 *   - "Upgrade to Elite" dialog appears immediately
 *   - "Buy merits" pack dialog appears immediately
 *   - repeated rapid clicks create exactly ONE checkout session
 *
 * SAFETY: no card details are ever entered, and `blockStripeSubmission()`
 * installs a network guard that aborts Stripe's confirm/submit endpoints. Even
 * an accidental interaction with the embedded form cannot take a payment.
 * Recent fixes under test: c7a73e60 (synchronous open, one session per click)
 * and beebb381 (same-pack double-click gap).
 */
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { freeAccount } from './helpers/env';
import { signIn } from './helpers/app';
import { safeLog } from './helpers/redact';
import type { Page } from '@playwright/test';

/** The dialog shell must be on screen this fast to count as "immediate". */
const IMMEDIATE_MS = 2_000;

/** Hard guard: abort any Stripe call that would actually move money. */
async function blockStripeSubmission(page: Page): Promise<void> {
  await page.route('**://api.stripe.com/**', (route) => {
    const url = route.request().url();
    const isSubmission =
      /\/confirm\b/.test(url) ||
      /payment_intents\/[^/]+\/confirm/.test(url) ||
      /setup_intents\/[^/]+\/confirm/.test(url) ||
      /\/payment_pages\/[^/]+\/(confirm|submit)/.test(url);
    if (isSubmission) {
      safeLog('[prod-smoke] BLOCKED a Stripe submission attempt — payment prevented');
      return route.abort();
    }
    return route.continue();
  });
}

/** Count create-checkout-session POSTs during an action. */
function trackSessions(page: Page): { count: () => number } {
  let n = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/functions/v1/create-checkout-session')) {
      n++;
    }
  });
  return { count: () => n };
}

/**
 * Any of the checkout surfaces the app can render.
 * Only testids that exist in SHIPPED code are used here — `checkout-modal` and
 * `embedded-checkout` appear solely inside unit-test mocks and would never match
 * against production.
 */
function checkoutSurface(page: Page) {
  return page
    .locator(
      '[data-testid="checkout-preparing"], [data-testid="payment-loading"], ' +
        '[data-testid="checkout-unavailable"], [data-testid="payment-unavailable"], ' +
        '[role="dialog"]',
    )
    .first();
}

test.beforeEach(() => requireCredentials());

test('Upgrade to Elite dialog appears immediately and creates exactly one session', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await blockStripeSubmission(page);
  await signIn(page, freeAccount());

  const sessions = trackSessions(page);
  await page.goto('/pricing');
  await expectNoRawErrors(page, '/pricing');

  const cta = page.getByRole('button', { name: /Upgrade to Elite/i }).first();
  await expect(cta, 'Upgrade to Elite CTA not found on /pricing').toBeVisible({ timeout: 30_000 });

  // IMMEDIACY: measure click → dialog visible.
  const started = Date.now();
  await cta.click({ noWaitAfter: true });
  await expect(checkoutSurface(page)).toBeVisible({ timeout: 15_000 });
  const openMs = Date.now() - started;
  safeLog(`[prod-smoke] Upgrade dialog opened in ${openMs}ms`);
  test.info().annotations.push({ type: 'upgrade-dialog-ms', description: String(openMs) });

  expect(openMs, `upgrade dialog took ${openMs}ms to appear (expected < ${IMMEDIATE_MS}ms)`)
    .toBeLessThan(IMMEDIATE_MS);

  // ONE SESSION PER CLICK: hammer the CTA; only one session may be created.
  for (let i = 0; i < 3; i++) {
    await cta.click({ timeout: 1_000, noWaitAfter: true }).catch(() => {});
  }
  await page.waitForTimeout(5_000);
  expect(
    sessions.count(),
    `repeated upgrade clicks created ${sessions.count()} checkout sessions (expected 1)`,
  ).toBe(1);

  await expectNoRawErrors(page, 'upgrade checkout dialog');

  // STOP HERE. Close without paying.
  await page.keyboard.press('Escape').catch(() => {});
});

test('Buy Additional Merits dialog appears immediately and creates exactly one session', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await blockStripeSubmission(page);
  await signIn(page, freeAccount());

  const sessions = trackSessions(page);
  await page.goto('/pricing#packs');
  await expectNoRawErrors(page, '/pricing#packs');

  const buyPack = page.locator('[aria-label*="merit pack"]').first();
  await expect(buyPack, 'no merit pack buy button found').toBeVisible({ timeout: 30_000 });

  const started = Date.now();
  await buyPack.click({ noWaitAfter: true });
  await expect(checkoutSurface(page)).toBeVisible({ timeout: 15_000 });
  const openMs = Date.now() - started;
  safeLog(`[prod-smoke] Merit pack dialog opened in ${openMs}ms`);
  test.info().annotations.push({ type: 'pack-dialog-ms', description: String(openMs) });

  expect(openMs, `merit pack dialog took ${openMs}ms to appear (expected < ${IMMEDIATE_MS}ms)`)
    .toBeLessThan(IMMEDIATE_MS);

  // Same-pack double-click gap (beebb381).
  for (let i = 0; i < 3; i++) {
    await buyPack.click({ timeout: 1_000, noWaitAfter: true }).catch(() => {});
  }
  await page.waitForTimeout(5_000);
  expect(
    sessions.count(),
    `repeated pack clicks created ${sessions.count()} checkout sessions (expected 1)`,
  ).toBe(1);

  await expectNoRawErrors(page, 'merit pack checkout dialog');

  // STOP HERE. No payment is submitted.
  await page.keyboard.press('Escape').catch(() => {});
});
