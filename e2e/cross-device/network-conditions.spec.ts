/**
 * Phase 03 · 03-05 · XDEV-08 / XRUN-05 / XDEV-07 — degraded-network DISCOVERY.
 *
 * WHAT IS SIMULATED AND HOW (03-RESEARCH.md Pitfall 10 — load-bearing):
 *   - OFFLINE uses `context.setOffline(true)`, which is honoured by all three
 *     engines.
 *   - SLOWNESS uses `page.route()` with an artificial delay before
 *     `route.continue()`. It deliberately does NOT use DevTools-Protocol network
 *     -condition emulation, which is CHROMIUM-ONLY and silently no-ops on firefox
 *     and webkit — a "slow network" assertion built on it would pass vacuously on
 *     two of the five projects and report the matrix green.
 *   - A STALLED CHUNK is a `page.route()` that never resolves, which is the
 *     faithful shape of `vercel.json`'s catch-all serving a redeployed-away
 *     chunk (it does not 404 — it returns 200 text/html, and each engine reports
 *     that differently: see the three-engine table in 03-RESEARCH.md Pitfall 3).
 *
 * WHAT IS ASSERTED vs WHAT IS RECORDED (D-22/D-23): at HEAD `src/` contains ZERO
 * `online` / `offline` / `visibilitychange` handlers and ZERO global
 * `window.onerror` / `unhandledrejection` handlers. So the ASSERTED contract here
 * is the one that must hold today — the user is never shown raw engine text and
 * never gets a blank document (UI-SPEC § Copywriting Contract, XRUN-06). What the
 * app does or does not offer instead is RECORDED as an annotation and triaged into
 * the registers. Plans 03-13 (chunk recovery) and 03-14 (connectivity seam) own the
 * behaviour and extend this spec with their own assertions.
 *
 * SECURITY: no request header, cookie or storage value is read or logged. Route
 * handlers only delay or stall; none inspects or rewrites a payload.
 *
 * NO RUN IS STARTED — every interaction is navigation on read-only surfaces.
 */
import { test, expect } from '@playwright/test';
import { gotoSettled, rawEngineLeaks, record, visibleText } from './surfaces';

/** Long enough to be observable, short enough to stay far under the 120 s timeout. */
const SLOW_DELAY_MS = 3_000;

/** The app's own backends. Deliberately narrow — third-party analytics is not the subject. */
const APP_API_GLOBS = ['**/rest/v1/**', '**/functions/v1/**', '**/auth/v1/**'];

/** An in-app destination that is a separate lazy chunk from the dashboard. */
const LAZY_DESTINATION = { linkName: 'Career Compass', urlPattern: /\/career-compass/ };

test.describe('degraded network discovery @xdev', () => {
  test('offline: an in-app navigation neither white-screens nor leaks engine text', async ({
    page,
    context,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    await gotoSettled(page, '/dashboard');

    await context.setOffline(true);

    // SPA navigation, not `page.goto` — a hard navigation while offline renders
    // the BROWSER's error page, which says nothing about this application.
    const link = page.getByRole('link', { name: LAZY_DESTINATION.linkName, exact: true }).first();
    await expect(link, 'the dashboard nav rail did not render its links').toBeVisible();
    await link.click();

    // The route change is the observable event; no arbitrary sleep is used.
    await expect(page).toHaveURL(LAZY_DESTINATION.urlPattern, { timeout: 30_000 });

    const rootChildren = await page.evaluate(
      () => document.getElementById('root')?.childElementCount ?? -1,
    );
    const text = await visibleText(page);
    const leaks = rawEngineLeaks(text);

    // RECORDED, not asserted — at HEAD there is no connectivity seam at all, and
    // this number is the evidence plan 03-14 starts from.
    record(testInfo, 'root-child-count-offline', String(rootChildren));
    record(
      testInfo,
      'offline-affordance',
      String(/offline|no internet|connection|reconnect/i.test(text)),
    );

    // ASSERTED: no blank document, and no raw engine text.
    expect(
      rootChildren,
      `#root emptied while offline on ${testInfo.project.name} — a white screen, ` +
        'not a controlled degraded state. Owner: plan 03-13 / 03-14.',
    ).toBeGreaterThan(0);
    expect(
      leaks,
      `raw engine text reached the user while offline on ${testInfo.project.name} ` +
        '(XRUN-06 forbids raw JS/network/provider text). Matched patterns only — ' +
        'the page text itself is deliberately not reproduced here.',
    ).toEqual([]);
  });

  test('slow API: the surface shows a waiting state rather than an error', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);
    record(testInfo, 'simulation', `page.route delay ${SLOW_DELAY_MS}ms (engine-neutral)`);

    for (const glob of APP_API_GLOBS) {
      await page.route(glob, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, SLOW_DELAY_MS));
        await route.continue();
      });
    }

    await page.goto('/dashboard');

    // Observe DURING the delay: the shell must be up and must not be showing an
    // error before its data has had a chance to arrive.
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 30_000 });

    const midFlightText = await visibleText(page);
    const midFlightLeaks = rawEngineLeaks(midFlightText);
    record(
      testInfo,
      'waiting-affordance',
      String(
        (await page.locator('[aria-busy="true"], [role="status"], .animate-spin').count()) > 0 ||
          /loading|analyzing|please wait/i.test(midFlightText),
      ),
    );

    expect(
      midFlightLeaks,
      `raw engine text was rendered while the app's own API was merely SLOW on ` +
        `${testInfo.project.name}. A slow network must never look like a failure ` +
        '(XRUN-05, XRUN-06).',
    ).toEqual([]);

    // And it must still settle once the delayed responses land.
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 });
  });

  test('stalled lazy chunk: the user is not left with a blank document', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    await gotoSettled(page, '/dashboard');

    // Registered AFTER the dashboard has loaded, so only the NEXT route's chunk
    // is affected. The handler intentionally never settles the route.
    let stalledRequests = 0;
    await page.route('**/assets/**.js', () => {
      stalledRequests += 1;
      // No fulfil, no abort, no continue — the request hangs, exactly as a chunk
      // request does when the CDN edge is wedged.
    });

    const link = page.getByRole('link', { name: LAZY_DESTINATION.linkName, exact: true }).first();
    await expect(link).toBeVisible();

    const [stalled] = await Promise.all([
      page.waitForRequest('**/assets/**.js', { timeout: 30_000 }).then(
        () => true,
        () => false,
      ),
      link.click(),
    ]);

    // If nothing was requested the chunk came from cache and this test proved
    // nothing — fail loudly rather than report a vacuous green.
    expect(
      stalled,
      'no /assets/*.js request was observed after navigating to a lazy route — ' +
        'the chunk was served from cache, so the stall was never simulated',
    ).toBe(true);
    record(testInfo, 'stalled-chunk-requests', String(stalledRequests));

    const rootChildren = await page.evaluate(
      () => document.getElementById('root')?.childElementCount ?? -1,
    );
    const text = await visibleText(page);
    record(testInfo, 'root-child-count-stalled', String(rootChildren));
    record(
      testInfo,
      'waiting-affordance',
      String((await page.locator('[aria-busy="true"], [role="status"]').count()) > 0),
    );

    expect(
      rootChildren,
      `#root emptied while a lazy chunk was stalled on ${testInfo.project.name}. ` +
        'Owner: plan 03-13 (vite:preloadError → single silent reload).',
    ).toBeGreaterThan(0);
    expect(
      rawEngineLeaks(text),
      `raw engine text reached the user during a stalled chunk load on ` +
        `${testInfo.project.name}. This is the engine-divergent message class in ` +
        '03-RESEARCH.md Pitfall 3. Owner: plan 03-13.',
    ).toEqual([]);
  });
});
