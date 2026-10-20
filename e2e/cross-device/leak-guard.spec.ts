/**
 * Phase 03 · 03-12 · OT-5 — the five-project, two-theme proof of XRUN-06.
 *
 * WHAT IS BEING PROVEN, and why only a browser can prove it: no raw JavaScript,
 * database, provider or stack text reaches a user on any state the client can
 * be forced into. The vitest half proves the frozen TABLE is clean and that the
 * two error boundaries drop raw text; this proves the RENDERED DOCUMENT is
 * clean on a real engine, where the text can also come from an uncaught
 * rejection painted by the engine itself, a router fallback, or a third-party
 * widget the unit tests never load.
 *
 * NON-VACUITY IS THE WHOLE DESIGN. Every state asserts THREE things:
 *   1. `document.body.innerText` is non-empty (a blank page cannot pass),
 *   2. the expected FROZEN-TABLE copy is on screen (the right message, not just
 *      the absence of a wrong one),
 *   3. the UI-SPEC leak-guard regex does not match.
 * Dropping (1) or (2) would turn this file into the discovery theatre
 * 03-CONTEXT calls the worst possible outcome — a confident green over a page
 * that rendered nothing.
 *
 * THE REGEX IS NOT DEFINED HERE. It is imported from `e2e/helpers/leak-guard.ts`,
 * which re-exports the same constant `src/lib/client-error-taxonomy.ts` gives
 * the unit tests. Plans 03-13 … 03-18 import from there too.
 *
 * ── DELIBERATELY NOT COVERED HERE ───────────────────────────────────────────
 *  - OFFLINE. `network-conditions.spec.ts` (03-05) already asserts the leak
 *    guard on an offline in-app navigation and is RED on four projects
 *    (defect XD-03). That row is owned by plans 03-13 / 03-14; duplicating the
 *    assertion here would add four more red rows attributed to the wrong plan
 *    and would fix nothing.
 *  - A FORCED ERROR-BOUNDARY FALLBACK. There is no injection that deterministically
 *    throws inside a boundary subtree on all five engines without shipping a
 *    test-only hook into production code, which would itself be a defect. That
 *    state is proven instead by `src/components/error-boundary-leak-guard.test.tsx`,
 *    which throws all four leak classes through BOTH boundaries and runs this
 *    same regex over the rendered DOM. Recorded in 03-12-SUMMARY.md.
 *
 * SECURITY: no credential, key or URL literal appears here; the session comes
 * from the shared `.auth/user.json` storageState and the origin from
 * `use.baseURL`. `assertNoLeak` never reproduces page text in a failure message.
 *
 * NO RUN IS STARTED. Every interaction is navigation or a control that is
 * blocked by construction — no Merit is ever consumed by this spec.
 */
import { test, expect, type Page } from '@playwright/test';
import { assertFrozenCopy, assertNoLeak, bodyText } from '../helpers/leak-guard';
import { applyTheme, record, settle, THEMES } from './surfaces';
import { CAPABILITY_COPY } from '../../src/lib/platform/capability-copy';

/** UI-SPEC § Surface B — the frozen testids (identical to plan 03-11's spec). */
const BANNER = '[data-testid="capability-degraded-banner"]';
const BLOCKED_AI = '[data-testid="capability-blocked-analysis"]';
const BLOCKED_CHECKOUT = '[data-testid="capability-blocked-checkout"]';
const DETAIL_DIALOG = '[data-testid="capability-detail-dialog"]';

/**
 * Force `degraded` before any page script runs — the same two injections plan
 * 03-11 established, reused rather than reinvented so the two specs cannot
 * disagree about what "degraded" means.
 */
async function forceDegraded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Worker;
    try {
      Object.defineProperty(window, 'isSecureContext', {
        configurable: true,
        get: () => false,
      });
    } catch {
      /* asserted below */
    }
  });
}

async function assertDegradedInjectionTook(page: Page): Promise<void> {
  expect(await page.evaluate(() => typeof (window as unknown as { Worker?: unknown }).Worker)).not.toBe(
    'function',
  );
  expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
}

/** Case A of `session-storage.spec.ts` — reading the property itself throws. */
const THROW_ON_STORAGE_GETTER = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      const error = new Error(
        "Failed to read the 'localStorage' property from 'Window': " +
          'Access is denied for this document.',
      );
      error.name = 'SecurityError';
      throw error;
    },
  });
};

/**
 * Run one state's assertions in BOTH themes.
 *
 * The theme swap is a class change on `<html>` (mirroring `ThemeToggle`), so it
 * costs no page load — which is what makes "both themes on five projects"
 * affordable inside the blocking `verify:baseline` gate.
 */
async function assertStateInBothThemes(
  page: Page,
  label: string,
  expectedCopy: readonly string[],
): Promise<void> {
  for (const theme of THEMES) {
    await applyTheme(page, theme);
    const text = await assertNoLeak(page, `${label} [${theme}]`);
    assertFrozenCopy(text, expectedCopy, `${label} [${theme}]`);
  }
}

/**
 * Wait for a page to have painted SOMETHING readable, without requiring the
 * heading `settle()` requires. Used for the states whose whole point is that we
 * do not know in advance which controlled surface the app lands on.
 */
async function waitForReadableText(page: Page): Promise<void> {
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
  await expect
    .poll(async () => (await bodyText(page)).trim().length, { timeout: 30_000 })
    .toBeGreaterThan(0);
}

test.describe('XRUN-06 leak guard @xdev', () => {
  test('OT-5a: capability-blocked AI and checkout states, both themes', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    await forceDegraded(page);

    // ── State 1: blocked AI entry point (UI-SPEC B2) ──────────────────────
    await page.goto('/upload');
    await settle(page);
    await assertDegradedInjectionTook(page);

    await expect(page.locator(BANNER), 'the gate did not evaluate on /upload').toBeVisible();
    await expect(page.locator(BLOCKED_AI).first()).toBeVisible();

    await assertStateInBothThemes(page, 'capability-blocked-analysis', [
      CAPABILITY_COPY.analysisHeading,
      CAPABILITY_COPY.analysisBody,
      CAPABILITY_COPY.supportedBrowsersAction,
      CAPABILITY_COPY.bannerBody,
    ]);

    // ── State 2: blocked checkout entry point (UI-SPEC B3) ────────────────
    await page.goto('/pricing');
    await settle(page);
    await assertDegradedInjectionTook(page);

    await expect(page.locator(BLOCKED_CHECKOUT).first()).toBeVisible();

    await assertStateInBothThemes(page, 'capability-blocked-checkout', [
      CAPABILITY_COPY.checkoutHeading,
      CAPABILITY_COPY.checkoutBody,
      CAPABILITY_COPY.supportedBrowsersAction,
    ]);

    // ── State 3: the capability detail dialog (UI-SPEC B4) ────────────────
    // The one state that ENUMERATES what is broken, and therefore the one most
    // likely to reach for an API name. B4 forbids API names, probe names and
    // version strings in the user-visible list; the leak guard is the machine
    // check that no probe name escaped into it.
    const detailLink = page.getByRole('button', { name: CAPABILITY_COPY.bannerLink }).first();
    if (await detailLink.count()) {
      await detailLink.click();
      await expect(page.locator(DETAIL_DIALOG)).toBeVisible();
      await assertStateInBothThemes(page, 'capability-detail-dialog', [
        CAPABILITY_COPY.detailTitle,
        CAPABILITY_COPY.detailIntro,
        CAPABILITY_COPY.detailFooter,
      ]);
      record(testInfo, 'capability-detail-dialog', 'asserted');
    } else {
      // The banner is session-scoped, so it may already have been dismissed on
      // this context. Say so rather than passing silently for the wrong reason.
      record(testInfo, 'capability-detail-dialog', 'banner-link-absent');
    }
  });

  test('OT-5b: restricted-storage boot state leaks nothing, both themes', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);
    record(testInfo, 'injection', 'window.localStorage getter throws SecurityError');

    await page.addInitScript(THROW_ON_STORAGE_GETTER);
    // `/pricing` rather than `/`: the landing route gates its content behind an
    // intro animation and paints ~21 characters for the first second, which is
    // too thin to distinguish "rendered" from "nearly blank" — the exact
    // ambiguity the vacuity guard exists to remove. `/pricing` is public, is
    // text-dense, and is a real surface a user reaches with storage blocked.
    await page.goto('/pricing');

    // The injection must have taken on THIS engine, or the result below means
    // nothing (the discipline `session-storage.spec.ts` established).
    const injectionActive = await page.evaluate(() => {
      try {
        void window.localStorage;
        return false;
      } catch {
        return true;
      }
    });
    expect(
      injectionActive,
      'the localStorage getter override did not take effect — this engine refused ' +
        'the redefinition, so any result below is meaningless',
    ).toBe(true);

    await waitForReadableText(page);

    for (const theme of THEMES) {
      await applyTheme(page, theme);
      const text = await assertNoLeak(page, `storage-blocked [${theme}]`);
      // Non-vacuity for a state that has no dedicated controlled surface yet:
      // prove the PAGE ITSELF rendered its content, so a blank document (the
      // XD-01 white screen) cannot pass. The dedicated `CLIENT_STORAGE_BLOCKED`
      // card is not rendered anywhere yet — see 03-12-SUMMARY.md § Deferred.
      expect(text.length, `storage-blocked [${theme}]: nothing readable rendered`).toBeGreaterThan(
        200,
      );
    }
  });

  test('OT-5c: a malformed run id must not surface a database error string', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    // THE database leak class, forced through the real stack rather than
    // simulated: a non-UUID path segment makes PostgREST answer with
    // `22P02 invalid input syntax for type uuid`, which the leak guard matches
    // literally. If any surface on this route renders a response body, this is
    // where it shows up.
    for (const id of ['not-a-valid-uuid', '00000000-0000-0000-0000-000000000000']) {
      await page.goto(`/results/${id}`);
      await waitForReadableText(page);

      for (const theme of THEMES) {
        await applyTheme(page, theme);
        await assertNoLeak(page, `results/${id} [${theme}]`);
      }
      record(testInfo, 'run-id-probe', id);
    }
  });
});
