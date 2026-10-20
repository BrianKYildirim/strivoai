/**
 * Phase 03 · XDEV-04 · XTEST-03 — the restricted-storage REGRESSION test.
 *
 * ── HISTORY: THIS SPEC WAS RED, AND THAT WAS THE DELIVERABLE ────────────────
 * Plan 03-05 authored these cases as DISCOVERY. Against pre-fix code Case A and
 * Case B FAILED on 5/5 engines (defects XD-01 and XD-02) while the Case C and
 * Case D controls passed in the same run — which is what proved the failures were
 * real and not artefacts of the injection. Plan 03-08 fixed the root causes and
 * this file is now the regression proof. A test that was always green proves
 * nothing; this one was demonstrably able to fail.
 *
 * ── WHAT WAS BROKEN ────────────────────────────────────────────────────────
 * `src/lib/supabaseClient.ts:16` passed
 * `storage: typeof window !== 'undefined' ? localStorage : undefined` into
 * `createClient`. One line, two distinct defects:
 *
 *   A (XD-01). It REFERENCED `localStorage` during module evaluation. Where
 *      reading the property throws — Chrome with site data blocked, managed /
 *      enterprise profiles, some privacy extensions — the module threw before
 *      React mounted: `#root` had 0 children, no error UI, nothing logged. The
 *      literal "works on my machine, blank page on theirs".
 *
 *   B (XD-02). A truthy `settings.storage` made `GoTrueClient` SKIP its own
 *      `supportsLocalStorage()` probe, so `memoryLocalStorageAdapter` was never
 *      installed (`GoTrueClient.js:222-233`). auth-js would have degraded
 *      correctly on its own. Compounded by `ThemeToggle.tsx:24`, which wrote to
 *      `localStorage` unguarded inside a `useEffect` — that throw escaped into
 *      React and unmounted the tree, so a *write* failure was a blank page too.
 *
 * ── THE FIXED CONTRACT (03-RESEARCH § Validation Architecture, OT-26) ───────
 *   1. Normal storage: the session survives a full reload.        → Case C
 *   2. Storage blocked: the app BOOTS. Never a white screen.      → Cases A, B
 *   3. Never a silent logout LOOP and never a reload loop.        → Cases A, B
 *   4. Within the tab's lifetime a session established after the
 *      failure keeps working across in-app navigation — exactly
 *      what `memoryLocalStorageAdapter` buys.                     → Case B2
 *   5. The degradation is explained to the user via
 *      `CLIENT_STORAGE_BLOCKED`.                                  → plan 03-12
 *
 * WHY @xdev: restricted-storage behaviour is engine-specific. WebKit's ITP caps
 * script-writable storage, Firefox's dom.storage blocking throws a different
 * error type, and the quota Safari private browsing enforces has no Blink
 * equivalent. A chromium-only assertion answers one third of the question.
 *
 * SECURITY: no storage value, cookie, header or token is ever read, logged or
 * annotated. Every assertion is a boolean, a count or an element shape. Case B's
 * proxy forwards reads to the real store WITHOUT the test observing them, and
 * the sign-in password is read from the environment and never recorded.
 */
import crypto from 'node:crypto';
import { test, expect, type Page, type Route } from '@playwright/test';
import { record, settle, signOutLocally, rawEngineLeaks, visibleText } from './surfaces';
import { E2E_TEST_EMAIL } from '../global-setup';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS,PATCH,DELETE',
} as const;

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  if (route.request().method() === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: { ...CORS } });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ...CORS },
    body: JSON.stringify(body),
  });
}

/**
 * Restricted-storage cases run fully parallel on five projects. Give each case
 * its own browser-local auth response and app data so they test auth-js's memory
 * adapter rather than competing for one remote account's password-token lane.
 */
async function installIsolatedSignInFixture(page: Page): Promise<void> {
  const userId = crypto.randomUUID();
  const resumeId = crypto.randomUUID();
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: `restricted-storage-${userId}@example.invalid`,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const accessToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: userId,
        aud: 'authenticated',
        role: 'authenticated',
        exp: 4_102_444_800,
      }),
    ).toString('base64url'),
    `restricted-storage-${crypto.randomUUID()}`,
  ].join('.');
  const session = {
    access_token: accessToken,
    refresh_token: `restricted-refresh-${userId}`,
    token_type: 'bearer',
    expires_in: 2_147_483_647,
    expires_at: 4_102_444_800,
    user,
  };

  await page.route('**/auth/v1/token*', (route) => fulfillJson(route, session));
  await page.route('**/auth/v1/user', (route) => fulfillJson(route, user));
  await page.route('**/functions/v1/log-client-diagnostic', (route) =>
    route.fulfill({ status: 204, headers: { ...CORS } }),
  );
  await page.route('**/rest/v1/profiles*', (route) =>
    fulfillJson(route, { id: userId, subscription_tier: 'free' }),
  );
  await page.route('**/rest/v1/career_targets*', (route) =>
    fulfillJson(route, { user_id: userId, professional_goal: 'Senior Software Engineer' }),
  );
  await page.route('**/rest/v1/user_merits*', (route) =>
    fulfillJson(route, { subscription_balance: 10, shop_balance: 0 }),
  );
  await page.route('**/rest/v1/rpc/get_merit_balance', (route) =>
    fulfillJson(route, {
      total: 10,
      subscription_balance: 10,
      shop_balance: 0,
      next_reset_date: null,
    }),
  );
  await page.route('**/rest/v1/merit_feature_costs*', (route) =>
    fulfillJson(route, [{ feature: 'resume_analysis', tier: 'free', cost: 3 }]),
  );
  await page.route('**/rest/v1/improvement_checklist*', (route) => fulfillJson(route, []));
  await page.route('**/rest/v1/resumes*', (route) => {
    if (route.request().url().includes(`id=eq.${resumeId}`)) {
      return fulfillJson(route, {
        id: resumeId,
        overall_score: 82,
        grading_data: { overallScore: 82 },
        analyzed_tier: 'free',
      });
    }
    return fulfillJson(route, [{ id: resumeId }]);
  });
}

/** Case A — reading the `localStorage` property itself throws. */
const THROW_ON_GETTER = () => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      // Chrome's real message when site data is blocked.
      const error = new Error(
        'Failed to read the \'localStorage\' property from \'Window\': ' +
          'Access is denied for this document.',
      );
      error.name = 'SecurityError';
      throw error;
    },
  });
};

/** Case B — the property reads fine, but every write throws a quota error. */
const THROW_ON_WRITE = () => {
  const real = window.localStorage;
  const restricted = {
    getItem: (key: string) => real.getItem(key),
    removeItem: (key: string) => real.removeItem(key),
    clear: () => real.clear(),
    key: (index: number) => real.key(index),
    get length() {
      return real.length;
    },
    setItem: () => {
      // Safari private browsing's shape: quota is 0, so any write throws.
      const error = new Error('QuotaExceededError: The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: () => restricted,
  });
};

/**
 * A bounded observation window. Required, and deliberately the only sleep in the
 * file: the assertions below are about the ABSENCE of an event (a reload loop, a
 * delayed bounce to /auth), and absence cannot be awaited on a locator. Kept
 * short so it costs ~1.5s per case rather than a timeout.
 */
const LOOP_OBSERVATION_MS = 1_500;

/** Counts main-frame document navigations from the moment it is installed. */
function watchMainFrameNavigations(page: Page): () => number {
  let count = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) count += 1;
  });
  return () => count;
}

/** `#root`'s child count, or -1 when `#root` is missing entirely. */
function rootChildCount(page: Page): Promise<number> {
  return page.evaluate(() => document.getElementById('root')?.childElementCount ?? -1);
}

/**
 * An in-app route change with NO document reload.
 *
 * `page.goto` is wrong here on purpose: a hard navigation re-evaluates the whole
 * module graph and would legitimately discard an in-memory session, so it could
 * never distinguish "memoryLocalStorageAdapter works" from "the session is gone".
 * `pushState` + a synthetic `popstate` is how react-router-dom v6's history
 * listener observes a location change, and it works identically on all three
 * engines without depending on a particular nav link being visible at a
 * particular viewport.
 */
async function spaNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }, path);
}

/**
 * Sign in through the REAL login form while a storage restriction is already
 * injected, then wait for the in-app redirect off /auth.
 *
 * A live sign-in rather than the seeded storage state, because the seeded state
 * lives on disk: when storage is restricted, `supportsLocalStorage()` correctly
 * reports the store unusable and auth-js reads from memory instead, so a
 * pre-existing on-disk session is invisible BY DESIGN. The only session that can
 * exist under this injection is one established inside the tab.
 *
 * SECURITY: the password comes from the environment and is neither recorded nor
 * asserted on; only the token endpoint's STATUS is read, never its body.
 */
async function signInWithStorageRestricted(page: Page): Promise<void> {
  const password = process.env.E2E_TEST_PASSWORD;
  expect(password, 'E2E_TEST_PASSWORD must be set').toBeTruthy();

  await installIsolatedSignInFixture(page);
  await signOutLocally(page);
  await page.goto('/auth');

  await page.locator('#email').fill(E2E_TEST_EMAIL);
  await page.locator('#password').fill(password as string);
  const [tokenResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/auth/v1/token') && response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Sign In', exact: true }).click(),
  ]);
  expect(tokenResponse.status(), 'sign-in failed under restricted storage').toBe(200);

  // Auth.tsx's SIGNED_IN listener performs an IN-APP redirect off /auth. It is
  // awaited rather than raced with a `page.goto`, which would reload the document
  // and discard the in-memory session on purpose.
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
}

/**
 * Walk two authenticated routes without a document reload and assert the session
 * held — the observable meaning of "no silent logout loop".
 *
 * `settle()` before each URL assertion is load-bearing, not decoration: a
 * `pushState` makes `page.url()` the target IMMEDIATELY, so asserting the URL
 * straight afterwards would pass even if ProtectedRoute then bounced to /auth a
 * tick later. Settling waits for the route to render past its spinner, so the URL
 * read afterwards is the route the user actually LANDED on — and settling itself
 * fails on a blank tree, which is how an unguarded storage access in the
 * authenticated shell (Navbar / TopBar / ThemeToggle) is caught.
 */
async function assertAuthedSpaNavigationHolds(page: Page): Promise<void> {
  await spaNavigate(page, '/dashboard');
  await settle(page);
  await expect(
    page,
    'an in-memory session was dropped navigating to /dashboard — the silent ' +
      'logout loop users describe as "it just logs me out"',
  ).toHaveURL(/\/dashboard/);

  await spaNavigate(page, '/career-compass');
  await settle(page);
  await expect(
    page,
    'an in-memory session was dropped navigating between two authenticated routes',
  ).toHaveURL(/\/career-compass/);
  await expect(page).not.toHaveURL(/\/auth/);
}

test.describe('restricted storage @xdev', () => {
  test('Case A — app still boots when the localStorage getter throws', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);
    record(testInfo, 'injection', 'window.localStorage getter throws SecurityError');

    // Prove the injection actually took effect in THIS engine before drawing any
    // conclusion from the result. Without this, a `defineProperty` that silently
    // failed would produce a confident green and hide the defect forever.
    await page.addInitScript(THROW_ON_GETTER);
    await page.goto('/');
    const navigations = watchMainFrameNavigations(page);

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
      'the localStorage getter override did not take effect — this engine ' +
        'refused the redefinition, so any result below is meaningless',
    ).toBe(true);

    const rootChildren = await rootChildCount(page);
    record(testInfo, 'root-child-count', String(rootChildren));

    // CONTRACT 2. Restricted storage degrades to an in-memory session. It does
    // NOT produce a blank document. This is the assertion that was RED at HEAD
    // on 5/5 projects (defect XD-01, root cause src/lib/supabaseClient.ts:16).
    expect(
      rootChildren,
      `#root has ${rootChildren} children on ${testInfo.project.name} with the ` +
        'localStorage getter throwing — a white screen (regression of XD-01).',
    ).toBeGreaterThan(0);

    // The page must not shout engine internals at the user. Only pattern NAMES
    // are surfaced on failure; the page text itself is never recorded.
    const leaks = rawEngineLeaks(await visibleText(page));
    expect(
      leaks,
      `raw engine text reached the user on ${testInfo.project.name}: ${leaks.join(', ')}`,
    ).toEqual([]);

    // CONTRACT 3. No reload loop — a boot failure that retries itself is the
    // other way this defect presents as "the page just flickers".
    await page.waitForTimeout(LOOP_OBSERVATION_MS);
    expect(
      navigations(),
      'the app re-navigated the main frame after boot — a reload loop',
    ).toBe(0);
    expect(await rootChildCount(page)).toBeGreaterThan(0);

    // FOLLOW-UP (plan 03-12): once Surface B lands, assert the
    // CLIENT_STORAGE_BLOCKED card is visible here so the user is TOLD the
    // session will not survive a reload, rather than discovering it. Contract 5
    // is deliberately unasserted in this plan — 03-08 supplies the signal
    // (src/lib/platform/storage-probe.ts), 03-12 renders it.
  });

  test('Case B — app still boots when every localStorage write throws', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);
    record(testInfo, 'injection', 'localStorage.setItem throws QuotaExceededError');

    await page.addInitScript(THROW_ON_WRITE);
    await page.goto('/dashboard');
    const navigations = watchMainFrameNavigations(page);

    const injectionActive = await page.evaluate(() => {
      try {
        window.localStorage.setItem('__strivo_probe__', '1');
        return false;
      } catch {
        return true;
      }
    });
    expect(
      injectionActive,
      'the localStorage.setItem override did not take effect — result is meaningless',
    ).toBe(true);

    // CONTRACT 2. RED at HEAD on 5/5 projects: `#root` was EMPTY, because
    // ThemeToggle's unguarded `setItem` threw inside a `useEffect` and unmounted
    // the tree (defect XD-02, second root-cause site).
    const root = page.locator('#root');
    await expect(root).toBeAttached();
    await expect(
      root,
      `#root is empty on ${testInfo.project.name} with writes throwing ` +
        '(Safari private browsing shape) — regression of XD-02.',
    ).not.toBeEmpty();

    const leaks = rawEngineLeaks(await visibleText(page));
    expect(
      leaks,
      `raw engine text reached the user on ${testInfo.project.name}: ${leaks.join(', ')}`,
    ).toEqual([]);

    // CONTRACT 3. Whatever surface the app settles on, it must settle. With
    // writes blocked, auth-js's `supportsLocalStorage()` correctly reports the
    // store unusable and installs `memoryLocalStorageAdapter`, so a session
    // written to disk BEFORE the failure is not readable and the user is signed
    // out ONCE, deterministically. That is the documented degradation, not a
    // loop — this asserts it does not become one.
    const settledUrl = page.url();
    await page.waitForTimeout(LOOP_OBSERVATION_MS);
    expect(
      navigations(),
      'the app re-navigated the main frame after settling — a reload / bounce loop',
    ).toBe(0);
    expect(page.url(), 'the app kept changing route after settling').toBe(settledUrl);
    expect(await rootChildCount(page)).toBeGreaterThan(0);
  });

  test('Case A2 — with the getter throwing, a session made in-tab survives in-app navigation', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);
    record(testInfo, 'injection', 'window.localStorage getter throws SecurityError');

    // Case A only proves the PUBLIC surface boots. This walks the authenticated
    // shell — Navbar, TopBar, ThemeToggle, DashboardLayout — with the getter
    // still throwing, which is where the remaining unguarded reads live.
    await page.addInitScript(THROW_ON_GETTER);
    await signInWithStorageRestricted(page);
    await assertAuthedSpaNavigationHolds(page);
  });

  test('Case B2 — with writes blocked, a session made in-tab survives in-app navigation', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);
    record(testInfo, 'injection', 'localStorage.setItem throws QuotaExceededError');

    // CONTRACT 4. This is the half of XD-02 that `memoryLocalStorageAdapter`
    // exists to buy, and the half the old override destroyed: with storage
    // unwritable the user must still be able to sign in and keep working for the
    // lifetime of the tab. Only a reload may cost them the session.
    await page.addInitScript(THROW_ON_WRITE);
    await signInWithStorageRestricted(page);
    await assertAuthedSpaNavigationHolds(page);
  });

  test('Case C — control: with normal storage the session survives a reload', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    // THE regression tripwire for the deletion in 03-08 Task 1. Removing an auth
    // client's `storage` option changes where the session lives; if the library
    // default resolved differently than expected, this is what would go red.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.locator('#root')).not.toBeEmpty();

    await page.reload();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(page.locator('#root')).not.toBeEmpty();
  });

  test('Case D — control: a signed-out visitor reaches the auth surface', async ({
    page,
  }, testInfo) => {
    record(testInfo, 'project', testInfo.project.name);

    // Anti-vacuity partner to Case C. Without this, Cases A-C could all pass
    // against an app that ignores the session entirely.
    await signOutLocally(page);
    await page.goto('/dashboard');

    await expect(page, 'a signed-out visitor was NOT redirected away from /dashboard').toHaveURL(
      /\/auth/,
      { timeout: 30_000 },
    );
  });
});
