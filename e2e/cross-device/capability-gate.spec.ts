/**
 * Phase 03 · 03-11 · OT-4 — the five-project proof of UI-SPEC Surface B, the IN-APP
 * capability gate (XDEV-01, D-07, XRUN-01).
 *
 * WHAT IS BEING PROVEN, and why it can only be proven in a browser:
 *
 *   1. In `degraded` tier, activating an AI or checkout CTA issues ZERO requests to
 *      any run-creating or session-creating endpoint. No run, no Merit reservation,
 *      no Stripe session, no PaymentIntent. This is the XRUN-01 money-path guarantee
 *      and it is asserted by COUNTING REQUESTS, not by reading source.
 *   2. The gate actually REACHED each of the five AI pages and both checkout
 *      surfaces. A gate that was never wired at one entry point is the failure this
 *      spec exists to make loud.
 *   3. In `supported` tier NOTHING changed — no capability UI renders at all. This is
 *      the false-positive tripwire, and it is the more expensive of the two failure
 *      directions: an over-eager probe locks a paying user out of what they bought.
 *
 * HOW `degraded` IS FORCED. Two injections, before any page script runs:
 *   - `delete window.Worker`      → the documentExtraction group fails → AI blocked.
 *   - `isSecureContext === false` → the paymentEmbedding group fails → checkout blocked.
 * Both are asserted to have actually taken effect on the engine under test, so an
 * engine that refused an injection cannot produce a false green from some other cause
 * (the same discipline as `browser-gate.spec.ts` OT-1).
 *
 * WHY SOME PAGES HAVE NO BLOCKED CTA. The seeded E2E account is FREE tier, and
 * Recruiting Lens and Interview Prep render a tier gate before any AI start CTA
 * exists. The per-page assertion is therefore two-branched and non-vacuous in BOTH
 * branches: either the blocked card is visible, or there is provably no live start
 * CTA on the page at all. `capability-degraded-banner` is asserted on every one of
 * the five, which proves the gate evaluated on that page regardless of branch. The
 * "every page is wired" property itself is proven deterministically and without a
 * tier dependency by `src/test/platform/capability-gate-wiring.test.ts`.
 *
 * SECURITY: no credential, key or URL literal appears here. The session comes from the
 * shared `.auth/user.json` storageState; the origin comes from `use.baseURL`.
 */
import { test, expect, type Page, type Request } from '@playwright/test';
import { rawEngineLeaks, settle, visibleText } from './surfaces';

/** UI-SPEC § Surface B — the frozen testids. */
const BANNER = '[data-testid="capability-degraded-banner"]';
const BLOCKED_AI = '[data-testid="capability-blocked-analysis"]';
const BLOCKED_CHECKOUT = '[data-testid="capability-blocked-checkout"]';

/**
 * Every endpoint that creates a run, reserves a Merit, or creates a payment object.
 * Matched against the full request URL.
 *
 * `js.stripe.com` is DELIBERATELY not in this set and is asserted separately below:
 * loading the payment provider's script is not a Strivo session-creating call, and
 * counting it would make the assertion fail for a reason that has nothing to do with
 * the guarantee.
 */
const MONEY_PATH = new RegExp(
  // Anchored on the edge-function prefix. Without it, `page.goto('/recruiting-lens')`
  // — the SPA route itself — matches the bare function name and the counter reports a
  // "money-path call" for a plain navigation. Observed, not hypothetical.
  '/functions/v1/(' +
  [
    'analyze-resume',
    'analyze-career',
    'grade-linkedin',
    'recruiting-lens',
    'interview-prep',
    'submit-[a-z-]+-job',
    'create-checkout-session',
    'create-payment-intent',
    'validate-document',
  ].join('|') +
  ')',
);

interface MoneyPathCounter {
  count: () => number;
  seen: () => string[];
}

/** Install a request counter over the money paths. Records paths, never queries. */
function countMoneyPathRequests(page: Page): MoneyPathCounter {
  const seen: string[] = [];
  page.on('request', (request: Request) => {
    const url = request.url();
    if (url.includes('js.stripe.com')) return; // explicitly excluded — see above
    if (!MONEY_PATH.test(url)) return;
    // Record the PATH only. A full URL can carry a query string, and a query string
    // on a Supabase function call can carry an access token.
    try {
      seen.push(new URL(url).pathname);
    } catch {
      seen.push('<unparseable>');
    }
  });
  return { count: () => seen.length, seen: () => seen };
}

/** Force `degraded` before any page script runs. */
async function forceDegraded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // documentExtraction → AI blocked.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Worker;
    // paymentEmbedding → checkout blocked. An own accessor shadows the prototype one.
    try {
      Object.defineProperty(window, 'isSecureContext', {
        configurable: true,
        get: () => false,
      });
    } catch {
      /* asserted below — a refused definition must fail loudly, not silently pass */
    }
  });
}

/** Prove the injections actually took on THIS engine. */
async function assertDegradedInjectionTook(page: Page): Promise<void> {
  expect(await page.evaluate(() => typeof (window as unknown as { Worker?: unknown }).Worker)).not.toBe(
    'function',
  );
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
}

/**
 * The five AI start CTAs, by their shipped labels.
 *
 * `reveal` is the control that has to be pressed first to reach the INPUT view on an
 * account that already has a saved result — LinkedIn Grader and Career Compass both
 * land on their result view for the seeded user, and without this step the spec would
 * inspect a page that has no start CTA on it and pass for the wrong reason.
 */
const AI_PAGES = [
  { id: 'resume-analysis', path: '/upload', cta: 'Analyze Resume', reveal: undefined },
  {
    id: 'linkedin-grader',
    path: '/linkedin-grader',
    cta: 'Get Personalized Analysis',
    reveal: 'Scan New Profile',
  },
  {
    id: 'career-compass',
    path: '/career-compass',
    cta: 'Discover My Career Path',
    reveal: 'Start New Analysis',
  },
  // Free tier: `ProFeatureGate` renders before any start CTA exists.
  { id: 'recruiting-lens', path: '/recruiting-lens', cta: 'Analyze Job', reveal: undefined },
  // `VITE_FEATURE_INTERVIEW_PREP` is off in this environment: `ComingSoon` renders.
  { id: 'interview-prep', path: '/interview-prep', cta: 'Generate Prep', reveal: undefined },
] as const;

/**
 * Activate a blocked control by CLICK, ENTER and SPACE. All three are required:
 * the control is `aria-disabled` rather than `disabled`, so it stays focusable and
 * all three activation paths genuinely reach it.
 */
async function activateEveryWay(page: Page, selector: string): Promise<void> {
  const control = page.locator(selector).first();
  await expect(control).toBeVisible();
  // `force` is REQUIRED and is not a workaround: Playwright's actionability check
  // treats `aria-disabled="true"` as "not enabled" and would refuse to click. A real
  // browser does no such thing — it dispatches the click, which is precisely why the
  // handler has to return early and why this assertion has to be able to fire it.
  await control.click({ force: true });
  await control.focus();
  await page.keyboard.press('Enter');
  await control.focus();
  await page.keyboard.press('Space');
}

test.describe('XDEV-01 in-app capability gate @xdev', () => {
  test('OT-4a: degraded tier blocks all five AI entry points with zero money-path calls', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'project', description: testInfo.project.name });

    const counter = countMoneyPathRequests(page);
    await forceDegraded(page);

    for (const surface of AI_PAGES) {
      await page.goto(surface.path);
      await settle(page);
      await assertDegradedInjectionTook(page);

      // The gate evaluated on THIS page — true in both branches below, so a page the
      // gate never reached fails here rather than passing vacuously through the
      // tier-gate branch.
      await expect(page.locator(BANNER), `${surface.id}: degraded banner`).toBeVisible();

      // A LIVE start CTA is one that is NOT the gate's replacement. The two share an
      // accessible name by design (the gate preserves the host page's label), so a
      // `getByRole` name match alone cannot tell them apart — and would report the
      // blocked control as proof that the page was never wired.
      const liveCta = page
        .locator('button:not([data-capability-blocked])')
        .filter({ hasText: surface.cta });

      if (surface.reveal) {
        const revealControl = page.getByRole('button', { name: surface.reveal }).first();
        if (await revealControl.count()) {
          await revealControl.click();
          // The reveal is a React state change, so the input view is not in the DOM on
          // the next tick. Wait for whichever control that view produces before
          // branching, or the branch is decided by a race rather than by the app.
          await page
            .locator(BLOCKED_AI)
            .or(liveCta)
            .first()
            .waitFor({ state: 'visible', timeout: 15_000 })
            .catch(() => {
              /* neither appeared — the branch below asserts what that means */
            });
        }
      }

      const blocked = page.locator(BLOCKED_AI);
      if (await blocked.count()) {
        await expect(blocked.first(), `${surface.id}: blocked card`).toBeVisible();

        const control = page.getByRole('button', { name: surface.cta }).first();
        await expect(control).toHaveAttribute('aria-disabled', 'true');

        await activateEveryWay(page, `button[aria-disabled="true"][data-capability-blocked="true"]`);

        // Focus landed on the explanation heading (UI-SPEC § Accessibility Contract).
        const focusedText = await page.evaluate(
          () => document.activeElement?.textContent ?? '',
        );
        expect(focusedText, `${surface.id}: focus after activation`).toContain(
          "Analysis isn't available in this browser",
        );

        testInfo.annotations.push({ type: surface.id, description: 'blocked-cta' });
      } else {
        // No AI start CTA exists for this account on this surface (a tier gate or a
        // feature flag ran first). Prove that rather than assuming it: a LIVE control
        // with this label must not exist either, so "unwired" cannot masquerade as
        // "gated".
        await expect(
          liveCta,
          `${surface.id}: no live start CTA may exist`,
        ).toHaveCount(0);
        testInfo.annotations.push({ type: surface.id, description: 'tier-gated-no-cta' });
      }

      // XRUN-06 leak guard on every blocked/degraded state.
      expect(rawEngineLeaks(await visibleText(page)), `${surface.id}: leak guard`).toEqual([]);
    }

    // THE guarantee.
    expect(counter.seen(), 'no run-creating call may be issued in degraded tier').toEqual([]);
    expect(counter.count()).toBe(0);
  });

  test('OT-4b: degraded tier blocks both checkout surfaces with zero session-creating calls', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'project', description: testInfo.project.name });

    const counter = countMoneyPathRequests(page);
    await forceDegraded(page);

    await page.goto('/pricing');
    await settle(page);
    await assertDegradedInjectionTook(page);

    // Surface 1 — the subscribe CTA.
    await expect(page.locator(BLOCKED_CHECKOUT).first()).toBeVisible();
    await activateEveryWay(page, 'button[aria-disabled="true"][data-capability-blocked="true"]');
    expect(
      await page.evaluate(() => document.activeElement?.textContent ?? ''),
    ).toContain("Checkout isn't available in this browser");

    // The real tier CTA must also be inert — the block is in the handler, so clicking
    // the shipped control creates nothing either.
    const tierCta = page
      .locator('button[aria-label="Upgrade to Elite"]:not([data-capability-blocked])')
      .first();
    if (await tierCta.count()) await tierCta.click({ force: true });

    // Surface 2 — the top-up trigger. It stays live and answers with the explanation
    // instead of a PaymentIntent.
    const packBuy = page.getByRole('button', { name: /Buy \d+-merit pack/i }).first();
    await packBuy.click();
    await expect(page.locator(BLOCKED_CHECKOUT).last()).toBeVisible();

    expect(rawEngineLeaks(await visibleText(page)), 'checkout leak guard').toEqual([]);

    expect(counter.seen(), 'no session-creating call may be issued in degraded tier').toEqual([]);
    expect(counter.count()).toBe(0);
  });

  test('OT-4c: supported tier renders NO capability UI and leaves the CTAs alone', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'project', description: testInfo.project.name });

    // No injection at all — this is the false-positive tripwire. If any probe in
    // `capabilities.ts` is over-eager, a real supported engine paints the gate here.
    for (const surface of [...AI_PAGES.map((s) => s.path), '/pricing']) {
      await page.goto(surface);
      await settle(page);

      await expect(page.locator(BANNER), `${surface}: no banner`).toHaveCount(0);
      await expect(page.locator(BLOCKED_AI), `${surface}: no blocked AI card`).toHaveCount(0);
      await expect(
        page.locator(BLOCKED_CHECKOUT),
        `${surface}: no blocked checkout card`,
      ).toHaveCount(0);
      await expect(
        page.locator('[data-capability-blocked="true"]'),
        `${surface}: no blocked control`,
      ).toHaveCount(0);
    }

    // And the shipped subscribe CTA is still a live control on /pricing.
    await expect(page.getByRole('button', { name: 'Upgrade to Elite' }).first()).toBeEnabled();
  });
});
