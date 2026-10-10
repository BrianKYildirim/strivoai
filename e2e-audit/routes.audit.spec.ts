/**
 * Release-readiness audit — authenticated route sweep, per tier.
 *
 * For EVERY authenticated route, for BOTH Free and Elite, assert the things the audit
 * actually cares about:
 *   - the route renders (does not bounce to /auth, does not white-screen)
 *   - no React error boundary / crash text
 *   - no uncaught page errors, and no non-benign console errors
 *   - the page paints real content (not an empty shell)
 *   - it survives a mid-session refresh (user is never trapped)
 *   - it renders at a 390x844 mobile viewport without horizontal overflow
 *
 * The tier is taken from the Playwright project name (free | elite).
 */
import { test, expect, type Page } from '@playwright/test';

const ROUTES = [
  '/dashboard',
  '/career-compass',
  '/linkedin-grader',
  '/recruiting-lens',
  '/interview-prep',
  '/jobs',
  '/applications',
  '/history',
  '/profile',
  '/pricing',
  '/celebrations',
  '/questions',
  '/how-it-works',
  '/upload',
];

// Console noise that is not a defect signal (analytics/CDN blocked in CI, expected 402/403
// merit responses that the app HANDLES, HMR chatter). Anything else is reported.
// Console noise that is NOT a defect signal. Each entry is justified — an unjustified
// entry here silently hides real bugs, which is worse than a noisy report.
const BENIGN = [
  // @vercel/analytics + @vercel/speed-insights fetch their scripts from /_vercel/*, which
  // is injected by the Vercel edge at serve time. We drive a local `vite preview`, so these
  // 404 by construction. Verified by URL capture (diagnose-404.audit.spec.ts) — they are the
  // ONLY 404s, and they resolve on a real Vercel deploy.
  /_vercel/i,
  /vercel/i,
  /speed-insights/i,
  /favicon/i,
  // Playwright cancels in-flight XHRs when the spec navigates to the next route. Verified by
  // URL capture: every ERR_ABORTED was a Supabase REST/auth call killed mid-flight by our own
  // navigation, not by the app.
  /ERR_ABORTED/i,
  /Failed to load resource: net::ERR_ABORTED/i,
  /ERR_BLOCKED_BY_CLIENT/i,
  /Download the React DevTools/i,
  // 402/403 are the merit system's DESIGNED responses (insufficient_merits / tier_locked).
  // The app handles them; the browser still logs the failed fetch.
  /Failed to load resource: the server responded with a status of 40[23]/i,
  /insufficient_merits/i,
  /tier_locked/i,
];

const CRASH_TEXT = [
  /Something went wrong/i,
  /Application error/i,
  /ChunkLoadError/i,
  /Cannot read propert/i,
  /undefined is not an object/i,
];

type Collected = { consoleErrors: string[]; pageErrors: string[] };

function collect(page: Page): Collected {
  const c: Collected = { consoleErrors: [], pageErrors: [] };
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // A "Failed to load resource" console line carries NO url in its text — the offending
    // url is only on m.location(). Filtering on text alone silently matched nothing and
    // made every route look broken. Match against text AND the source url.
    const subject = `${m.text()} ${m.location()?.url ?? ''}`;
    if (BENIGN.some((re) => re.test(subject))) return;
    c.consoleErrors.push(subject.trim());
  });
  page.on('pageerror', (e) => c.pageErrors.push(String(e)));
  return c;
}

for (const route of ROUTES) {
  test(`renders ${route}`, async ({ page }, testInfo) => {
    const tier = testInfo.project.name;
    const c = collect(page);

    const resp = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(resp?.status(), `${route} HTTP status`).toBeLessThan(400);

    // Must not be bounced to auth or trapped in onboarding.
    await page.waitForTimeout(2500);
    expect(page.url(), `${route} [${tier}] must not bounce to /auth`).not.toMatch(/\/auth/);
    expect(page.url(), `${route} [${tier}] must not bounce to /onboarding`).not.toMatch(/\/onboarding/);

    // Must paint real content, not an empty shell.
    const body = (await page.locator('body').innerText().catch(() => '')) ?? '';
    expect(body.trim().length, `${route} [${tier}] rendered an empty page`).toBeGreaterThan(40);

    // No crash / error-boundary text.
    for (const re of CRASH_TEXT) {
      expect(body, `${route} [${tier}] shows crash text ${re}`).not.toMatch(re);
    }

    // No uncaught errors.
    expect(c.pageErrors, `${route} [${tier}] uncaught page errors`).toEqual([]);
    expect(c.consoleErrors, `${route} [${tier}] console errors`).toEqual([]);
  });
}

test('survives a mid-session refresh on every route (user is never trapped)', async ({ page }, testInfo) => {
  const tier = testInfo.project.name;
  const trapped: string[] = [];
  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    if (/\/auth|\/onboarding/.test(page.url())) trapped.push(`${route} -> ${page.url()}`);
  }
  expect(trapped, `[${tier}] refresh bounced the user out of these routes`).toEqual([]);
});

test('mobile 390x844: no horizontal overflow on any route', async ({ page }, testInfo) => {
  const tier = testInfo.project.name;
  await page.setViewportSize({ width: 390, height: 844 });
  const overflowing: string[] = [];

  for (const route of ROUTES) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return { scrollW: d.scrollWidth, clientW: d.clientWidth };
    });
    // Allow 1px rounding slack.
    if (overflow.scrollW > overflow.clientW + 1) {
      overflowing.push(`${route} (scrollWidth ${overflow.scrollW} > viewport ${overflow.clientW})`);
    }
  }
  expect(overflowing, `[${tier}] routes overflow horizontally at 390px`).toEqual([]);
});
