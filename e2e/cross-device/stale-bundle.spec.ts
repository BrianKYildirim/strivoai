/**
 * Phase 03 · 03-13 · XDEV-07 / XTEST-03 — UI-SPEC Surface E, proven on five engines.
 *
 * WHAT IS SIMULATED AND WHY IT IS FAITHFUL. A redeploy deletes the chunk an open
 * tab was about to load. `page.route(...).abort()` on exactly that one chunk
 * reproduces it deterministically on every engine, and — unlike matching an
 * error message — says nothing about which engine is running. Only the ONE lazy
 * route chunk is aborted; the entry bundle is never touched, so the app itself
 * always boots and a failure here can only mean the recovery is wrong.
 *
 * ── OT-14 OBSERVES ABSENCE, AND ABSENCE IS THE HARD THING TO ASSERT ─────────
 * "No error appeared" is trivially true on a page that never rendered. So the
 * probe here is a `MutationObserver` installed via `addInitScript` BEFORE any
 * page script runs, persisting into `sessionStorage` so its record SURVIVES the
 * reload it is watching for. A final screenshot could not do this: the offending
 * frame is gone by the time the navigation commits. The test then proves, in
 * order, that (1) the route was actually reached, (2) the document actually
 * reloaded, (3) `pathname` + `search` + `hash` are byte-identical, and only THEN
 * (4) that no `[role="alert"]` node was ever attached and no captured text ever
 * matched the shared leak guard.
 *
 * ── THE LEAK GUARD IS IMPORTED, NEVER RETYPED ──────────────────────────────
 * From `e2e/helpers/leak-guard.ts`, which re-exports the same constant
 * `src/lib/client-error-taxonomy.ts` gives the unit tests (03-12).
 *
 * SECURITY: no request header, cookie or storage VALUE is read or logged. The
 * probe records only element shapes and page text, the text is used only for
 * pattern matching, and no failure message reproduces it.
 *
 * NO RUN IS STARTED. Every interaction is navigation on read-only surfaces, so
 * no Merit is ever consumed.
 */
import { test, expect, type Page } from '@playwright/test';
import { LEAK_GUARD_PATTERN, assertNoLeak, bodyText } from '../helpers/leak-guard';
import { record, settle } from './surfaces';
import {
  STALE_BUNDLE_GUARD_KEY,
  STALE_BUNDLE_URL_MARKER,
} from '../../src/lib/platform/stale-bundle';

/**
 * A PUBLIC lazy route with its own chunk. Public on purpose: it renders
 * identically on all five projects with no data dependency, so a red here is
 * unambiguously the recovery and never a fixture. The chunk name prefix is
 * stable across builds; only the content hash moves.
 */
const LAZY_ROUTE = '/how-it-works';
const LAZY_CHUNK = /\/assets\/HowItWorks-[^/]*\.js(\?.*)?$/;

/** Route reached with a query and a fragment, so D-19's preservation is assertable. */
const LAZY_ROUTE_DEEP = `${LAZY_ROUTE}?src=stale-bundle#section`;

const PROBE_KEY = '__strivo_stale_probe__';

interface ProbeState {
  armed: boolean;
  documents: number;
  /** Every document's own URL, in order — the reload trail, for diagnosis. */
  docs: string[];
  alerts: string[];
  snapshots: string[];
}

/**
 * The shape `vercel.json`'s catch-all ACTUALLY returns for a chunk a redeploy
 * deleted: not a 404, but `200 text/html` (the SPA shell). Reproducing that
 * exactly is what makes the simulation faithful — it is the response that
 * produces the three divergent engine messages this plan refuses to match on.
 *
 * `no-store` matters: WebKit will otherwise reuse the failed module entry for
 * the same URL after the reload, which would make the recovery look broken when
 * it is not. In production the point is moot — the recovered document references
 * a chunk with a NEW content hash, i.e. a different URL entirely.
 */
const DELETED_CHUNK_RESPONSE = {
  status: 200,
  contentType: 'text/html; charset=utf-8',
  headers: { 'cache-control': 'no-store, must-revalidate' },
  body: '<!doctype html><html><head></head><body></body></html>',
} as const;

/**
 * Installed before ANY page script, on every document — including the one the
 * reload creates. State lives in `sessionStorage` precisely so the pre-reload
 * record is still readable afterwards.
 */
async function installProbe(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    // MAIN FRAME ONLY. `addInitScript` also runs in every same-origin
    // `about:blank` iframe an engine creates (Firefox makes several), and those
    // share `sessionStorage` with the top document — counting them would inflate
    // the reload trail and make the loop-guard assertion meaningless.
    if (window.top !== window.self) return;

    const load = (): {
      armed: boolean;
      documents: number;
      docs: string[];
      alerts: string[];
      snapshots: string[];
    } | null => {
      try {
        const raw = window.sessionStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };
    const save = (value: unknown): void => {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* restricted storage — the probe degrades, it never throws */
      }
    };

    const initial = load() ?? { armed: false, documents: 0, docs: [], alerts: [], snapshots: [] };
    initial.documents += 1;
    // Which document THIS script instance is running in — stamped onto every
    // alert below so absence can be asserted for the exact window UI-SPEC E1
    // governs (detection → the reload committing) rather than for all time.
    const documentIndex = initial.documents;
    initial.docs = (initial.docs ?? []).concat([
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    ]);
    save(initial);

    const snapshot = (): void => {
      const state = load();
      if (!state || !state.armed) return;
      const text = document.body ? document.body.innerText || '' : '';
      if (!text) return;
      if (state.snapshots[state.snapshots.length - 1] === text) return;
      state.snapshots.push(text.slice(0, 4000));
      if (state.snapshots.length > 80) state.snapshots.shift();
      save(state);
    };

    const noteAlerts = (nodes: Node[]): void => {
      const state = load();
      if (!state || !state.armed) return;
      let changed = false;
      for (const node of nodes) {
        if (!node || node.nodeType !== 1) continue;
        const element = node as Element;
        const hits: Element[] = [];
        if (element.matches && element.matches('[role="alert"]')) hits.push(element);
        if (element.querySelectorAll) {
          element.querySelectorAll('[role="alert"]').forEach((found) => hits.push(found));
        }
        for (const hit of hits) {
          state.alerts.push(
            `${documentIndex}|${hit.getAttribute('data-testid') ?? '(no-testid)'}|${(hit.textContent ?? '').slice(0, 160)}`,
          );
          changed = true;
        }
      }
      if (changed) save(state);
    };

    const start = (): void => {
      const observer = new MutationObserver((records) => {
        for (const entry of records) {
          noteAlerts(Array.prototype.slice.call(entry.addedNodes) as Node[]);
        }
        snapshot();
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      // A React commit that adds and removes within one microtask can still be
      // missed by a coalesced mutation batch; a cheap poll closes that gap.
      window.setInterval(snapshot, 50);
    };

    if (document.documentElement) start();
    else document.addEventListener('readystatechange', start, { once: true });
  }, PROBE_KEY);
}

async function armProbe(page: Page): Promise<void> {
  await page.evaluate((key: string) => {
    try {
      const raw = window.sessionStorage.getItem(key);
      const state = raw ? JSON.parse(raw) : { documents: 1, docs: [], alerts: [], snapshots: [] };
      state.armed = true;
      window.sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, PROBE_KEY);
}

async function readProbe(page: Page): Promise<ProbeState> {
  return page.evaluate((key: string) => {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw
        ? (JSON.parse(raw) as ProbeState)
        : { armed: false, documents: 0, docs: [], alerts: [], snapshots: [] };
    } catch {
      return { armed: false, documents: 0, docs: [], alerts: [], snapshots: [] };
    }
  }, PROBE_KEY);
}

/** The build id the SERVER is currently advertising (`vercel.json` serves it no-store). */
async function deployedBuildId(page: Page): Promise<string> {
  const res = await page.request.get('/version.json');
  expect(res.ok(), '/version.json was not served — 03-02 emits it at build time').toBe(true);
  const body = (await res.json()) as { buildId?: string };
  expect(typeof body.buildId).toBe('string');
  expect(body.buildId).not.toBe('');
  return body.buildId as string;
}

test.describe('stale-bundle recovery @xdev', () => {
  test('OT-14: a deleted chunk reloads silently, with zero visible error surface', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    await installProbe(page);

    // Exactly ONE request for this chunk is killed — the deploy is "fixed" by
    // the time the recovery reload asks again, which is the real-world shape:
    // the tab was holding a URL that no longer existed. Aborting every attempt
    // instead would trip the loop guard and turn this into OT-15.
    let aborted = 0;
    let served = 0;
    await page.route(LAZY_CHUNK, async (route) => {
      if (aborted === 0) {
        aborted += 1;
        await route.fulfill(DELETED_CHUNK_RESPONSE);
        return;
      }
      served += 1;
      await route.continue();
    });

    // Arm on a cheap same-origin document so the probe is live for the very
    // first byte of the document under test.
    const chunkRequests: string[] = [];
    page.on('request', (req) => {
      if (LAZY_CHUNK.test(req.url())) chunkRequests.push(req.url());
    });

    await page.goto('/');
    await armProbe(page);

    await page.goto(LAZY_ROUTE_DEEP);
    await settle(page);
    record(testInfo, 'chunk-requests-observed', String(chunkRequests.length));

    const probe = await readProbe(page);
    record(testInfo, 'aborted-chunk-requests', String(aborted));
    record(testInfo, 'served-chunk-requests', String(served));
    record(testInfo, 'documents-created', String(probe.documents));
    record(testInfo, 'document-trail', probe.docs.join(' -> '));
    record(testInfo, 'alerts-attached', String(probe.alerts.length));
    record(testInfo, 'text-snapshots', String(probe.snapshots.length));

    // (0) The simulation actually happened. A green over an un-aborted chunk
    //     would prove nothing at all.
    expect(
      aborted,
      'the lazy chunk was never requested — it came from cache, so no failure was simulated',
    ).toBeGreaterThan(0);

    // (1) The route was actually reached, and (2) it reloaded to get there.
    //     `/` + the deep route + the recovery reload = at least three documents.
    expect(
      probe.documents,
      'the document never reloaded — recovery did not run, so the absence assertions below would be vacuous',
    ).toBeGreaterThanOrEqual(3);

    // (3) D-19: pathname, search and hash survive byte-identically.
    const location = await page.evaluate(() => ({
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    }));
    expect(location.pathname).toBe(LAZY_ROUTE);
    expect(location.search).toBe('?src=stale-bundle');
    expect(location.hash).toBe('#section');

    // (4) UI-SPEC E1 — absence, observed rather than photographed, and scoped to
    //     the window E1 actually governs: from the failing document being armed
    //     up to and including the reload committing. `detectionDoc` is the first
    //     document that reached the lazy route, computed from the trail rather
    //     than hardcoded.
    const detectionDoc = probe.docs.findIndex((href) => href.startsWith(LAZY_ROUTE)) + 1;
    expect(detectionDoc, 'the trail never reached the lazy route').toBeGreaterThan(0);
    const alertsDuringReload = probe.alerts.filter(
      (entry) => Number(entry.split('|')[0]) <= detectionDoc,
    );
    expect(
      alertsDuringReload.map((entry) => entry.split('|')[1]),
      'an element with role="alert" was attached during the silent stale-bundle reload. ' +
        'UI-SPEC E1 forbids ANY frame of an error surface on the happy path — including ' +
        'the one React.lazy throws a microtask after preventDefault(). ' +
        `documents=${probe.documents} aborted=${aborted} served=${served} requests=${chunkRequests.length} trail=${probe.docs.join(' -> ')}`,
    ).toEqual([]);

    const leaked = probe.snapshots.filter((snapshot) => LEAK_GUARD_PATTERN.test(snapshot));
    expect(
      leaked.length,
      'raw JavaScript / provider / stack text was on screen at some point during the ' +
        'stale-bundle reload (XRUN-06). The count is reported; the text deliberately is not.',
    ).toBe(0);

    // (5) The END state. Never a white screen, on any engine.
    await expect(page.locator('#root')).not.toBeEmpty();
    const text = await assertNoLeak(page, 'OT-14 recovered document');

    // (6) Which of the two legitimate end states applies is decided by an
    //     OBSERVABLE fact, not by naming an engine: did the recovered document
    //     actually get a working chunk?
    //
    //     WebKit poisons a failed subresource URL for the whole session, so the
    //     reloaded document is served the same broken response without the route
    //     handler seeing the request. That is an artefact of re-using ONE URL —
    //     a real redeploy changes the content hash, so the recovered document
    //     asks for a different file. Recorded as R-25 in the residual register.
    record(testInfo, 'recovered-chunk-served', String(served > 0));
    if (served > 0) {
      // The deploy is fixed: the route renders and E2 never appears at all.
      await expect(page.locator('[data-testid="stale-bundle-fallback"]')).toHaveCount(0);
      expect(text.length).toBeGreaterThan(0);
    } else {
      // The bundle is STILL broken, so the loop guard must have produced exactly
      // one honest E2 surface — never a loop, never a blank page, never a leak.
      await expect(page.locator('[data-testid="stale-bundle-fallback"]')).toHaveCount(1);
      expect(text).toContain("Couldn't finish updating Strivo");
      expect(probe.documents).toBe(detectionDoc + 1);
    }
  });

  test('OT-15: when the loop guard proves the reload already failed, exactly one honest fallback', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    const buildId = await deployedBuildId(page);
    record(testInfo, 'deployed-build-id-present', String(buildId.length > 0));

    await installProbe(page);

    // Seed the guard as though this tab had ALREADY spent its one reload on this
    // exact build. Written before any page script runs, so the very first
    // detection reads it.
    await page.addInitScript(
      ({ key, id }: { key: string; id: string }) => {
        try {
          window.sessionStorage.setItem(key, JSON.stringify({ buildId: id, at: Date.now() }));
        } catch {
          /* the URL-marker guard covers this browser instead */
        }
      },
      { key: STALE_BUNDLE_GUARD_KEY, id: buildId },
    );

    // The deploy stays broken: every attempt at this chunk fails.
    let aborted = 0;
    await page.route(LAZY_CHUNK, async (route) => {
      aborted += 1;
      await route.fulfill(DELETED_CHUNK_RESPONSE);
    });

    await page.goto('/');
    await armProbe(page);
    await page.goto(LAZY_ROUTE_DEEP);

    const fallback = page.locator('[data-testid="stale-bundle-fallback"]');
    await expect(fallback).toBeVisible({ timeout: 30_000 });
    expect(aborted, 'the chunk was served from cache — the failure was never simulated').toBeGreaterThan(0);

    const probe = await readProbe(page);
    record(testInfo, 'documents-created', String(probe.documents));
    record(testInfo, 'document-trail', probe.docs.join(' -> '));

    // It did NOT loop: the guard stopped the second reload. `/` + the deep route
    // and nothing more.
    expect(
      probe.documents,
      'the tab reloaded again despite the loop guard — this is the failure that makes things worse. ' +
        `trail=${probe.docs.join(' -> ')}`,
    ).toBeLessThanOrEqual(2);

    // Exactly ONE surface: the fallback owns #root, nothing is stacked on it.
    await expect(fallback).toHaveCount(1);
    await expect(page.locator('#root')).not.toBeEmpty();

    // Focus moved to the heading (UI-SPEC E2).
    const focused = await page.evaluate(() => ({
      tag: document.activeElement?.tagName ?? '',
      inFallback: !!document.activeElement?.closest('[data-testid="stale-bundle-fallback"]'),
      isHeading: document.activeElement?.tagName === 'H1',
    }));
    expect(focused.inFallback, 'focus did not move into the E2 fallback').toBe(true);
    expect(focused.isHeading, 'focus did not land on the E2 heading').toBe(true);

    // The cache-busting CTA target, and — because that id came from the compiled
    // `__STRIVO_BUILD_ID__` define — the RUNTIME half of 03-02's build-output
    // assertion. A silently broken `define` would render `_v=unknown` here.
    const cta = page.locator('[data-testid="stale-bundle-reload"]');
    await expect(cta).toBeVisible();
    const href = (await cta.getAttribute('href')) ?? '';
    expect(href).toContain(`${STALE_BUNDLE_URL_MARKER}=`);
    expect(href).toBe(`/?${STALE_BUNDLE_URL_MARKER}=${encodeURIComponent(buildId)}`);

    // Honest copy, and no leak. `assertNoLeak` refuses to pass on a blank page.
    const text = await assertNoLeak(page, 'OT-15 loop-guard fallback');
    expect(text).toContain("Couldn't finish updating Strivo");
    expect(text).toContain('Reload Strivo');
    expect(probe.alerts.length, 'the fallback IS a role="alert" — it must be the only one').toBe(1);
  });

  test('control: a deep SPA link still resolves', async ({ page }) => {
    // The tripwire for any `vercel.json` rewrite change. A malformed exclusion
    // 404s every deep link, which is far worse than the engine-specific error
    // string the exclusion exists to remove.
    await page.goto(LAZY_ROUTE_DEEP);
    await settle(page);
    expect(new URL(page.url()).pathname).toBe(LAZY_ROUTE);
    await expect(page.locator('#root')).not.toBeEmpty();
    expect((await bodyText(page)).trim().length).toBeGreaterThan(0);
  });

  test('control: the build identity actually reaches a built chunk', async ({ page }, testInfo) => {
    // 03-02 could not assert this (its module had no importer and was tree-shaken)
    // and 03-06 converted it into an import-CHAIN assertion. This is the
    // build-OUTPUT assertion both deferred: a silently broken Vite `define` would
    // ship `app_version: "unknown"` and a dead version poll with nothing red.
    const buildId = await deployedBuildId(page);
    expect(buildId, 'version.json advertises the fail-closed placeholder').not.toBe('unknown');

    await page.goto('/');
    const initialModules = await page.evaluate(() =>
      Array.from(new Set([
        ...Array.from(document.querySelectorAll('script[src]'))
          .map((script) => (script as HTMLScriptElement).src),
        ...Array.from(document.querySelectorAll('link[rel="modulepreload"][href]'))
          .map((link) => (link as HTMLLinkElement).href),
      ])),
    );
    expect(initialModules.length, 'the document loaded no initial modules').toBeGreaterThan(0);

    let carriers = 0;
    for (const src of initialModules) {
      const res = await page.request.get(src);
      if (!res.ok()) continue;
      if ((await res.text()).includes(buildId)) carriers += 1;
    }
    record(testInfo, 'chunks-carrying-build-id', String(carriers));
    expect(
      carriers,
      'no initial module contains the deployed build id — the Vite `define` did not reach the ' +
        'bundle, so getBuildId() returns "unknown" and stale-bundle recovery is silently dead',
    ).toBeGreaterThan(0);
  });
});
