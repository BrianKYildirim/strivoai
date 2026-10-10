/**
 * App-level actions for the production smoke test.
 * Selectors are anchored to the real components:
 *   - src/pages/Auth.tsx            → #email, #password, "Sign In"
 *   - MeritBalanceHeaderV2.tsx      → aria-label="Merit balance: {n} of {cap} merits"
 *   - src/pages/Upload.tsx          → "Analyze Resume"
 *   - src/pages/LinkedInGrader.tsx  → "Get Personalized Analysis"
 *   - src/pages/CareerCompass.tsx   → "Discover My Career Path"
 *   - src/pages/RecruitingLens.tsx  → "Analyze Job"
 */
import { expect, type Page } from '@playwright/test';
import type { Account } from './env';

/** Sign in through the real login form. Asserts on status only — never on values. */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto('/auth');
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(account.password);

  const [tokenResponse] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/auth/v1/token') && r.request().method() === 'POST',
      { timeout: 60_000 },
    ),
    page.getByRole('button', { name: 'Sign In', exact: true }).click(),
  ]);

  // Message carries the ACCOUNT LABEL, never the email or password.
  expect(
    tokenResponse.status(),
    `production sign-in for the "${account.label}" account failed`,
  ).toBe(200);

  // Let Auth.tsx's post-sign-in work settle before navigating. Navigating
  // straight after the token response aborts those in-flight requests, which
  // surfaces as a spurious "TypeError: Failed to fetch" console error that would
  // otherwise be indistinguishable from a real CORS/network fault.
  await page.waitForLoadState('networkidle').catch(() => {});

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 60_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

/**
 * Dismiss a first-visit tutorial/coach-mark overlay if one is present.
 * Recruiting Lens renders one ("Skip tutorial" / "Start job analysis" / "Close")
 * that sits above the form and swallows clicks on the real CTA — the click
 * reports as landed while no submission ever fires.
 */
export async function dismissTutorial(page: Page): Promise<boolean> {
  const skip = page.getByRole('button', { name: /Skip tutorial/i }).first();

  // The tour mounts AFTER first paint, so a single immediate check races it and
  // reports "no tutorial" moments before one appears. Wait for it, then dismiss,
  // then confirm it is actually gone (some tours need a second click).
  await skip.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  if (!(await skip.count())) return false;

  for (let attempt = 0; attempt < 3; attempt++) {
    await skip.click({ timeout: 5_000, force: true }).catch(() => {});
    await page.waitForTimeout(750);
    if (!(await skip.isVisible().catch(() => false))) return true;
  }

  // Last resort: the tour's own Close control, then Escape.
  await page.getByRole('button', { name: /^Close$/i }).first().click({ force: true }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
  return !(await skip.isVisible().catch(() => false));
}

/** Total merit balance from the header control. Returns null if not rendered. */
export async function readMeritBalance(page: Page): Promise<number | null> {
  const el = page.locator('[aria-label^="Merit balance:"]').first();
  if ((await el.count()) === 0) return null;
  const label = (await el.getAttribute('aria-label')) ?? '';
  const match = label.match(/Merit balance:\s*(\d+)\s*of/i);
  return match ? Number(match[1]) : null;
}

/** Wait for the balance to settle, then read it. */
export async function settledMeritBalance(page: Page): Promise<number | null> {
  await page.waitForLoadState('networkidle').catch(() => {});
  return readMeritBalance(page);
}

/**
 * Click a primary CTA N times in rapid succession to probe duplicate-submit
 * guards. Returns how many clicks actually landed (a correctly guarded button
 * disables after the first, so later clicks are expected to be swallowed).
 */
export async function rapidClick(
  page: Page,
  name: string | RegExp,
  times: number,
): Promise<number> {
  const button = page.getByRole('button', { name }).first();
  let landed = 0;
  for (let i = 0; i < times; i++) {
    try {
      await button.click({ timeout: 1_500, noWaitAfter: true });
      landed++;
    } catch {
      // Disabled/detached after the first click — that is the guard working.
      break;
    }
  }
  return landed;
}

/**
 * Assert that exactly ONE submission fired.
 *
 * A fixed sleep is wrong here: these features run preceding awaits (resume
 * fetch, client-side validation) before the edge-function call, so a short
 * window reads 0 and a long one wastes minutes. Poll until the first submission
 * lands, then keep watching for a settling period to catch a duplicate.
 */
export async function expectExactlyOneSubmission(
  page: Page,
  submissions: string[],
  label: string,
  { appearTimeout = 90_000, settleMs = 8_000 } = {},
): Promise<void> {
  await expect
    .poll(() => submissions.length, {
      timeout: appearTimeout,
      message: `${label}: no submission fired within ${appearTimeout}ms`,
    })
    .toBeGreaterThanOrEqual(1);

  await page.waitForTimeout(settleMs);

  expect(
    submissions.length,
    `${label}: ${submissions.length} submissions fired (expected exactly 1) — duplicate-click guard failed`,
  ).toBe(1);
}

/** Count POST calls to a given edge function during an action. */
export async function countFunctionCalls(
  page: Page,
  functionName: string,
  action: () => Promise<void>,
  settleMs = 4_000,
): Promise<number> {
  let count = 0;
  const listener = (req: { url: () => string; method: () => string }) => {
    if (req.method() === 'POST' && req.url().includes(`/functions/v1/${functionName}`)) {
      count++;
    }
  };
  page.on('request', listener);
  try {
    await action();
    await page.waitForTimeout(settleMs);
  } finally {
    page.off('request', listener);
  }
  return count;
}
