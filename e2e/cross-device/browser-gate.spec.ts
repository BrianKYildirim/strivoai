/**
 * Phase 03 · 03-07 · XDEV-01 — the five-project proof of UI-SPEC Surface A, the
 * PRE-BUNDLE browser gate (D-08a).
 *
 * WHAT IS BEING PROVEN: `index.html` now carries an ES5 inline guard that runs before
 * the module bundle is parsed. Its whole value is that it speaks when nothing inside
 * `src/` can — so it has to be proven against a bundle that genuinely does not boot,
 * on every engine, not asserted in a unit test against jsdom.
 *
 * THREE OBSERVATIONS, EACH A DIFFERENT FAILURE MODE:
 *   OT-1  capability failure  -> A1 renders, A2 does not.
 *   OT-2  bundle never boots  -> A2 renders, A1 does not.
 *   OT-3  healthy boot        -> NEITHER renders, and the placeholder is gone.
 *
 * OT-1 and OT-2 use the SAME non-booting condition and differ by exactly one thing:
 * whether a probed global is present. That is deliberate — it makes the pair a clean
 * experiment on the one property that matters, that the right fallback wins. Each
 * asserts the presence of one testid AND the absence of the other, so the two
 * diagnoses can never both paint. Telling somebody on a slow connection that their
 * browser is unsupported is a contract violation, not a cosmetic bug.
 *
 * WHY OT-1 ALSO ABORTS THE ENTRY MODULE: on a successful boot `main.tsx` REMOVES the
 * gate (UI-SPEC rule 6 — the gate must never fight a healthy app for the viewport).
 * A browser genuinely missing `fetch` cannot run the bundle either, so aborting the
 * entry is what makes the injection faithful rather than a race against removal.
 *
 * BUDGET: OT-2 is the only case that spends wall-clock, and it spends it because the
 * 8000ms watchdog is the contract. It is not padded, and OT-1 deliberately does NOT
 * re-buy that 8 s to observe the same mutual exclusion from the other side.
 *
 * SECURITY: no credential, key or URL literal appears here. The session comes from the
 * shared `.auth/user.json` storageState; the origin comes from `use.baseURL`.
 */
import { test, expect, type Page } from '@playwright/test';
import { rawEngineLeaks, visibleText } from './surfaces';

/** UI-SPEC § Surface A — the frozen testids. */
const A1 = '[data-testid="browser-gate-unsupported"]';
const A2 = '[data-testid="browser-gate-boot-timeout"]';

/** UI-SPEC § Surface A — the frozen headings, asserted so copy cannot drift. */
const A1_HEADING = "Strivo can't run in this browser";
const A2_HEADING = "Strivo didn't finish loading";

/**
 * The built entry chunk. Vite emits it as `/assets/index-<hash>.js` and hoists the
 * module tag into `<head>`; aborting it is the closest available analogue of a bundle
 * that fails to parse or fails to evaluate.
 */
const ENTRY_MODULE = '**/assets/index-*.js';

/** Abort the entry module so nothing inside `src/` can run. */
async function breakTheBundle(page: Page): Promise<void> {
  await page.route(ENTRY_MODULE, (route) => route.abort());
}

test.describe('XDEV-01 pre-bundle browser gate @xdev', () => {
  test('OT-1: a missing core capability renders A1, never A2', async ({ page }, testInfo) => {
    testInfo.annotations.push({ type: 'project', description: testInfo.project.name });

    // Delete a global the ES5 guard probes, BEFORE any page script runs. This is the
    // only injection that reaches code executing during document parse.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).fetch;
    });
    await breakTheBundle(page);

    await page.goto('/');

    // The capability verdict is deterministic and immediate — no watchdog wait.
    await expect(page.locator(A1)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(A1)).toContainText(A1_HEADING);
    // Confirm the injection actually took effect on this engine, so an engine that
    // refused the delete cannot produce a false green from some other cause.
    expect(await page.evaluate(() => typeof window.fetch)).not.toBe('function');

    // The two diagnoses are mutually exclusive.
    await expect(page.locator(A2)).toHaveCount(0);

    // The gate must offer a way forward, not just a verdict.
    await expect(page.locator('#browser-gate a[href="/supported-browsers.html"]')).toBeVisible();

    // XRUN-06: no raw engine text reaches the user on a controlled-failure surface.
    expect(rawEngineLeaks(await visibleText(page))).toEqual([]);
  });

  test('OT-2: a bundle that never boots renders A2 within the watchdog, never A1', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'project', description: testInfo.project.name });

    // Capabilities are intact here; only the bundle is broken. This is the confirmed
    // white-screen case — `#root` stays attached and empty forever.
    await breakTheBundle(page);

    await page.goto('/');

    // Wait ON the testid with a timeout above the 8000ms threshold rather than
    // sleeping blindly. The elapsed time is the contract, so it cannot be shortened.
    await expect(page.locator(A2)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(A2)).toContainText(A2_HEADING);

    await expect(page.locator(A1)).toHaveCount(0);

    // Proof this really is the white-screen case the guard now covers.
    await expect(page.locator('#root')).toBeEmpty();

    expect(rawEngineLeaks(await visibleText(page))).toEqual([]);
  });

  test('OT-3: a successful boot leaves no guard element for any frame', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'project', description: testInfo.project.name });

    // ABSENCE is proven with a MutationObserver installed before any page script,
    // not with a final screenshot: a screenshot taken after removal cannot tell a
    // gate that never painted from one that painted and was cleaned up.
    await page.addInitScript(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__gateEverPainted = false;
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target as Element | null;
          if (
            target &&
            target.nodeType === 1 &&
            target.id === 'browser-gate' &&
            record.addedNodes.length > 0
          ) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).__gateEverPainted = true;
          }
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });

    await page.goto('/');

    // The app really did boot — otherwise "no guard" would be trivially true on a
    // page where nothing at all happened.
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });
    expect(await page.evaluate(() => window.__strivoBooted)).toBe(true);

    // The observer never saw the gate acquire a child.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await page.evaluate(() => (window as any).__gateEverPainted)).toBe(false);

    // And `main.tsx` took the placeholder back off the DOM.
    await expect(page.locator('#browser-gate')).toHaveCount(0);
    await expect(page.locator(A1)).toHaveCount(0);
    await expect(page.locator(A2)).toHaveCount(0);
  });

  test('the supported-browsers page is served statically, not by the SPA rewrite', async ({
    page,
  }, testInfo) => {
    testInfo.annotations.push({ type: 'project', description: testInfo.project.name });

    // UI-SPEC Surface A rule 1. The catch-all rewrite would otherwise hand back the
    // SPA shell here — a bundle-dependent page for a bundle failure.
    await page.goto('/supported-browsers.html');

    const html = await page.content();
    expect(html).not.toContain('type="module"');
    expect(html).not.toContain('/assets/');
    expect(html).not.toContain('id="root"');
    await expect(page.locator('script[type="module"]')).toHaveCount(0);

    // Positive assertion: it is the real page, not an empty 200.
    await expect(page.getByRole('heading', { name: 'Supported browsers' })).toBeVisible();
    expect(rawEngineLeaks(await visibleText(page))).toEqual([]);
  });
});
