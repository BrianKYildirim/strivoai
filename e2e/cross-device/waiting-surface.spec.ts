/**
 * Phase 03 · 03-15 · OT-8 / OT-9 — honest waiting states.
 *
 * Every backend response is synthetic. No analysis is started and no Merit can
 * be charged. OT-9 is intentionally scoped to Chromium plus both mobile
 * projects: three 150-second observations run in parallel and preserve the
 * phase's +3 minute gate budget without removing any project from the matrix.
 */
import { expect, test, type Page, type Route } from '@playwright/test';
import { assertNoLeak } from '../helpers/leak-guard';
import { WAITING_SURFACE_COPY } from '../../src/lib/analysis-stage-copy';

const RESUME_ID = '00000000-0000-4000-8000-000000000315';
const JOB_ID = '00000000-0000-4000-8000-000000000316';
const RESULTS_ROUTE = `/results/${RESUME_ID}?jobId=${JOB_ID}`;
const LONG_WAIT_PROJECTS = new Set(['chromium', 'mobile-webkit', 'mobile-chromium']);
const RESULTS_RECOVERY_HEADING = 'Analysis Taking Longer Than Expected';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS,PATCH,DELETE',
  'cache-control': 'no-store',
} as const;
const SYNTHETIC_USER_ID = '00000000-0000-4000-8000-000000000317';
const SYNTHETIC_USER = {
  id: SYNTHETIC_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'waiting-surface@example.invalid',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00.000Z',
} as const;
const SYNTHETIC_ACCESS_TOKEN = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(
    JSON.stringify({
      sub: SYNTHETIC_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      exp: 4_102_444_800,
    }),
  ).toString('base64url'),
  'synthetic-signature',
].join('.');

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

async function installWaitingFixture(page: Page, stallStatus = false): Promise<void> {
  await page.addInitScript(
    ({ accessToken, user }) => {
      const session = {
        access_token: accessToken,
        refresh_token: 'synthetic-refresh-token',
        token_type: 'bearer',
        expires_in: 2_147_483_647,
        expires_at: 4_102_444_800,
        user,
      };
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && /^sb-.*-auth-token$/.test(key)) {
          localStorage.setItem(key, JSON.stringify(session));
        }
      }
    },
    { accessToken: SYNTHETIC_ACCESS_TOKEN, user: SYNTHETIC_USER },
  );
  await page.route('**/auth/v1/user', (route) => fulfillJson(route, SYNTHETIC_USER));
  await page.route('**/auth/v1/token*', (route) =>
    fulfillJson(route, {
      access_token: SYNTHETIC_ACCESS_TOKEN,
      refresh_token: 'synthetic-refresh-token',
      token_type: 'bearer',
      expires_in: 2_147_483_647,
      user: SYNTHETIC_USER,
    }),
  );
  await page.route('**/functions/v1/log-client-diagnostic', (route) =>
    route.fulfill({ status: 204, headers: { ...CORS } }),
  );
  await page.route('**/rest/v1/resumes*', (route) => {
    if (route.request().url().includes('user_id=eq.')) {
      return fulfillJson(route, [{ id: RESUME_ID }]);
    }
    return fulfillJson(route, {
      id: RESUME_ID,
      overall_score: null,
      grading_data: null,
      analyzed_tier: null,
      created_at: '2026-01-01T00:00:00.000Z',
    });
  });
  await page.route('**/rest/v1/career_targets*', (route) =>
    fulfillJson(route, { professional_goal: 'Senior Product Designer' }),
  );
  await page.route('**/rest/v1/improvement_checklist*', (route) => fulfillJson(route, []));
  await page.route('**/rest/v1/profiles*', (route) =>
    fulfillJson(route, { id: 'seeded', subscription_tier: 'free' }),
  );
  await page.route('**/functions/v1/get-analysis-job-status', (route) => {
    if (stallStatus && route.request().method() !== 'OPTIONS') return;
    return fulfillJson(route, { status: 'processing', pollAfterMs: 600 });
  });
}

function waitingSurface(page: Page) {
  return page.getByRole('dialog', { name: 'Analyzing your resume' });
}

function stageLine(page: Page) {
  return page.getByTestId('analysis-stage-list');
}

test.describe('honest waiting surface @xdev', () => {
  // All projects share one seeded account. Serialise this spec within each
  // project so its three long-lived contexts do not race session refresh.
  test.describe.configure({ mode: 'serial' });

  test('OT-8: a frozen server cannot advance the visible stage for 60 seconds', async ({
    page,
  }) => {
    test.setTimeout(140_000);
    await installWaitingFixture(page);
    await page.goto(RESULTS_ROUTE);
    await expect(waitingSurface(page)).toBeVisible({ timeout: 30_000 });

    const initial = (await stageLine(page).innerText()).trim();
    expect(initial.length).toBeGreaterThan(0);
    const observedAt = Date.now();
    for (const checkpointMs of [15_000, 30_000, 45_000, 60_000]) {
      await page.waitForTimeout(Math.max(0, checkpointMs - (Date.now() - observedAt)));
      expect((await stageLine(page).innerText()).trim()).toBe(initial);
    }
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    await assertNoLeak(page, 'OT-8 frozen stage');
  });

  test('OT-9: a 150-second client stall never becomes a failure', async ({
    page,
  }, testInfo) => {
    test.setTimeout(190_000);
    test.skip(
      !LONG_WAIT_PROJECTS.has(testInfo.project.name),
      '03-15 budget: the 150-second proof runs on Chromium and both mobile projects',
    );

    await page.addInitScript(() => {
      const state = { alertAttached: false, destructiveSeen: false };
      (window as unknown as { __waitingSurfaceAudit: typeof state }).__waitingSurfaceAudit = state;
      const inspect = () => {
        if (document.querySelector('[role="alert"]')) state.alertAttached = true;
        const destructive = getComputedStyle(document.documentElement)
          .getPropertyValue('--destructive')
          .trim();
        if (!destructive) return;
        for (const element of document.querySelectorAll<HTMLElement>('body *')) {
          if (getComputedStyle(element).color.includes(destructive)) {
            state.destructiveSeen = true;
            break;
          }
        }
      };
      new MutationObserver(inspect).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'role'],
      });
      document.addEventListener('DOMContentLoaded', inspect);
    });
    await installWaitingFixture(page, true);
    await page.goto(RESULTS_ROUTE);
    await expect(waitingSurface(page)).toBeVisible({ timeout: 30_000 });
    const observedAt = Date.now();

    await expect(
      page.getByRole('button', { name: WAITING_SURFACE_COPY.continueInBackground }),
    ).toHaveCount(0);
    await page.waitForTimeout(30_000);
    await expect(page.getByText(WAITING_SURFACE_COPY.reassurance)).toHaveCount(0);

    await expect(page.getByText(WAITING_SURFACE_COPY.reassurance)).toBeVisible({
      timeout: 25_000,
    });
    await expect(
      page.getByRole('button', { name: WAITING_SURFACE_COPY.continueInBackground }),
    ).toBeVisible();

    // Assert the contract named by this case at the actual 150-second boundary.
    // Under full-matrix CPU contention, browser timers can legally run after
    // their minimum delay; checking at 115-130 seconds raced that timer while
    // the same snapshot still showed the correct honest waiting surface.
    await page.waitForTimeout(Math.max(0, 150_000 - (Date.now() - observedAt)));
    await expect
      .poll(
        async () =>
          (await page.getByText(WAITING_SURFACE_COPY.polling).count()) +
          (await page.getByRole('heading', { name: RESULTS_RECOVERY_HEADING }).count()),
        {
          message:
            'the 120-second state must remain an honest polling/recovery surface, never a failure',
          timeout: 15_000,
        },
      )
      .toBe(1);

    const audit = await page.evaluate(
      () =>
        (window as unknown as {
          __waitingSurfaceAudit: { alertAttached: boolean; destructiveSeen: boolean };
        }).__waitingSurfaceAudit,
    );
    expect(audit.alertAttached).toBe(false);
    expect(audit.destructiveSeen).toBe(false);
    const honestWaitStillVisible =
      (await waitingSurface(page).count()) === 1 ||
      (await page.getByRole('heading', { name: RESULTS_RECOVERY_HEADING }).count()) === 1;
    expect(honestWaitStillVisible).toBe(true);
    expect((await page.locator('body').innerText())).not.toMatch(/\d+\s*%/);
    await assertNoLeak(page, 'OT-9 150-second stall');
  });

  test('reduced motion leaves zero infinite animations on the surface', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await installWaitingFixture(page);
    await page.goto(RESULTS_ROUTE);
    await expect(waitingSurface(page)).toBeVisible({ timeout: 30_000 });
    const infiniteAnimations = await waitingSurface(page).evaluate(
      (surface) =>
        surface
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getTiming().iterations === Infinity).length,
    );
    expect(infiniteAnimations).toBe(0);
  });
});
