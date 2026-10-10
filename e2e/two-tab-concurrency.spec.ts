/**
 * Phase 09 · 09-06 · VER-02 / S-20 — TWO SIMULTANEOUS BROWSER TABS.
 *
 * THE GAP THIS CLOSES: there was no `browser.newContext()` anywhere in `e2e/` — every
 * existing spec runs in ONE context. The hook-level dup-guard tests
 * (`useAnalysisRun.test.ts`: "the dup-guard holds the original run_id when startRun fires
 * again mid-flight") are the closest existing coverage, but they are single-context: they
 * prove the guard holds inside ONE React tree. This spec is the first genuine multi-context
 * test, and it proves the invariant that SURVIVES a second browser context.
 *
 * THE MONEY RISK (T-09-06-A): a user with the app open in two tabs must never be charged
 * twice for ONE analysis. Two independent contexts share NOTHING client-side (separate
 * localStorage, separate sessionStorage, separate React trees) — so any protection that
 * lives only in per-tab React state is invisible across them.
 *
 * ── POSTURE (read this before judging the skipped test) ─────────────────────────────────
 * The E2E environment runs the analysis lifecycle DORMANT, by design:
 *   - `VITE_FEATURE_ANALYSIS_LIFECYCLE` is absent from the E2E build env, so
 *     `isAnalysisLifecycleEnabled()` is false → `useAnalysisRun` early-returns inert,
 *     `startRun` no-ops, and NO run_id is persisted to the URL or localStorage.
 *   - `MERIT_SYSTEM_ENABLED` is likewise dormant (D-03 keeps it OFF outside staging).
 * The cross-context run_id RECOVERY assertion is therefore not observable until the
 * activation plans (D-01/D-02) flip those flags. It is written out in full below and
 * QUARANTINED (owner + expiry, registered in TESTING-STRATEGY.md) rather than deleted,
 * weakened, or silently skipped — D-11: there are no silent gaps.
 *
 * What DOES run unconditionally, in both postures, is the flag-independent half of the
 * same invariant, and it has real teeth: ONE submit with TWO live tabs open must create
 * EXACTLY ONE analysis and AT MOST ONE merit debit. A second tab that ever auto-triggered
 * or duplicated a run (an easy regression to introduce while wiring cross-tab recovery)
 * turns this RED.
 *
 * DETERMINISM (T-09-06-E): AI is stubbed SERVER-SIDE via the existing `AI_TEST_MODE` seam
 * on the TEST project's edge functions — the same seam `resume-analysis.spec.ts` relies on.
 * Zero live Anthropic calls. A flaky test in a blocking gate is how gates get bypassed.
 *
 * DATA (D-15): a per-run UNIQUE synthetic document (`fixtures/make-unique-resume.ts`) using
 * the same synthetic persona as the committed fixture ("Jordan E2E Baseline",
 * jordan.baseline@example.com — an RFC-2606 reserved domain). No real user data, ever.
 *
 * WHY A UNIQUE DOCUMENT, NOT THE STATIC FIXTURE (a finding worth stating plainly): Upload
 * de-duplicates on `file_hash` — a document the user has already analyzed short-circuits to
 * the EXISTING result with no new run and no new charge (correct behaviour; scenario S-08).
 * The static `fixtures/test-resume.pdf` was analyzed by this user on 2026-06-11, so any
 * spec submitting it today observes the DEDUP path, never a real run: it renders a report
 * heading in ~3s having created zero rows. A concurrency spec built on it would assert
 * nothing about concurrency. Each run here therefore submits a never-before-seen hash.
 *
 * SECURITY: the service-role key is read in the NODE process only (the `e2e/global-setup.ts`
 * precedent) and is NEVER passed to page.evaluate / addInitScript / any browser-visible
 * surface. The browser contexts hold only the anon-key session from storageState.
 */
import { test, expect, type Browser, type Page, type Route } from '@playwright/test';
import crypto from 'node:crypto';
import { E2E_TEST_EMAIL } from './global-setup';
import { makeUniqueResumePdf } from './fixtures/make-unique-resume';
import { mockValidDocumentResponse } from './helpers/mock-document-validator';
import { assertNoLeak } from './helpers/leak-guard';
import {
  adminClient,
  analyzedResumeCountForFile,
  diagnoseLiveAnthropic,
  meritDebitKeyMultiplicity,
  requireTestUserId,
  resetAnalyzeResumeRateLimit,
  seedMerits,
} from './helpers/test-user';

const AUTH_STATE = '.auth/user.json';
const BROWSER_SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS,PATCH,DELETE',
  'cache-control': 'no-store',
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

interface RapidClickFixture {
  requestCount(): number;
  releaseUpload(): void;
  releaseCompletion(): void;
  overlayMounts(page: Page): Promise<number>;
  toastMounts(page: Page): Promise<number>;
}

/**
 * Keep this proof deterministic and Merit-free: only the browser submit path is real.
 * Persistence and the run endpoint are local route fixtures, so the assertions prove one
 * request and one visible waiting surface but DO NOT prove one Merit debit. The real ledger
 * assertion belongs to operator production pass P-1.
 */
async function installRapidClickFixture(
  page: Page,
  completeRequest = false,
  holdUpload = false,
): Promise<RapidClickFixture> {
  let requestCount = 0;
  let releaseUpload = () => {};
  let releaseCompletion = () => {};
  const userId = crypto.randomUUID();
  const resumeId = crypto.randomUUID();
  const syntheticUser = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: `rapid-submit-${userId}@example.invalid`,
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
    `rapid-submit-${crypto.randomUUID()}`,
  ].join('.');
  const uploadGate = holdUpload
    ? new Promise<void>((resolve) => {
        releaseUpload = resolve;
      })
    : Promise.resolve();
  const completionGate = completeRequest
    ? new Promise<void>((resolve) => {
        releaseCompletion = resolve;
      })
    : Promise.resolve();

  await page.addInitScript(({ authStorageKey, accessToken, user }) => {
    const session = {
      access_token: accessToken,
      refresh_token: `rapid-refresh-${user.id}`,
      token_type: 'bearer',
      expires_in: 2_147_483_647,
      expires_at: 4_102_444_800,
      user,
    };
    if (authStorageKey) localStorage.setItem(authStorageKey, JSON.stringify(session));
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        localStorage.setItem(key, JSON.stringify(session));
      }
    }

    const audit = { overlayMounts: 0, toastMounts: 0 };
    (window as unknown as { __rapidClickAudit: typeof audit }).__rapidClickAudit = audit;
    const inspect = (node: Node) => {
      if (!(node instanceof Element)) return;
      const candidates = [
        ...(node.matches('[role="dialog"][aria-label="Analyzing your resume"]') ? [node] : []),
        ...node.querySelectorAll('[role="dialog"][aria-label="Analyzing your resume"]'),
      ];
      audit.overlayMounts += candidates.length;
      const toasts = [
        ...(node.matches('[data-sonner-toast]') ? [node] : []),
        ...node.querySelectorAll('[data-sonner-toast]'),
      ];
      audit.toastMounts += toasts.length;
    };
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) inspect(node);
      }
    }).observe(document, { childList: true, subtree: true });
  }, {
    accessToken,
    authStorageKey: BROWSER_SUPABASE_URL
      ? `sb-${BROWSER_SUPABASE_URL.split('://')[1].split('.')[0]}-auth-token`
      : '',
    user: syntheticUser,
  });

  // These cases are fully parallel. Keep auth and every pre-submit read local so workers
  // never share the baseline user's refresh token, profile, goal, merits or fixed row IDs.
  await page.route('**/auth/v1/user', (route) => fulfillJson(route, syntheticUser));
  await page.route('**/auth/v1/token*', (route) =>
    fulfillJson(route, {
      access_token: accessToken,
      refresh_token: `rapid-refresh-${userId}`,
      token_type: 'bearer',
      expires_in: 2_147_483_647,
      user: syntheticUser,
    }),
  );
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
  await mockValidDocumentResponse(page);
  if (holdUpload) {
    await page.route('**/functions/v1/validate-document', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: { ...CORS } });
        return;
      }
      await uploadGate;
      await fulfillJson(route, { ok: true, kind: 'pdf', pageCount: 1 });
    });
  }
  await page.route('**/storage/v1/object/sign/resumes/**', (route) =>
    fulfillJson(route, { signedURL: `https://example.invalid/${resumeId}.pdf` }),
  );
  await page.route('**/storage/v1/object/resumes/**', (route) =>
    fulfillJson(route, { Key: `resumes/${resumeId}.pdf` }),
  );
  await page.route('**/rest/v1/resumes*', (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      return fulfillJson(route, [{
        id: resumeId,
        file_name: 'synthetic-resume.pdf',
        grading_data: null,
      }]);
    }
    const url = request.url();
    if (url.includes('select=id&') && url.includes('user_id=eq.')) {
      return fulfillJson(route, [{ id: 'seeded-resume' }]);
    }
    if (url.includes(`id=eq.${resumeId}`)) {
      return fulfillJson(route, {
        id: resumeId,
        overall_score: null,
        grading_data: null,
        analyzed_tier: null,
      });
    }
    return fulfillJson(route, []);
  });
  await page.route('**/functions/v1/analyze-resume', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...CORS } });
      return;
    }
    requestCount += 1;
    if (completeRequest) {
      await completionGate;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: { ...CORS },
        body: `data: ${JSON.stringify({
          type: 'complete',
          result: {
            overallScore: 78,
            criterionFeedback: [],
            strengths: ['Clear experience history.'],
            priorityImprovements: [],
          },
        })}\n\n`,
      });
      return;
    }
    await new Promise<void>(() => {});
  });

  const audit = (target: Page) =>
    target.evaluate(
      () =>
        (window as unknown as {
          __rapidClickAudit: { overlayMounts: number; toastMounts: number };
        }).__rapidClickAudit,
    );
  return {
    requestCount: () => requestCount,
    releaseUpload,
    releaseCompletion,
    overlayMounts: async (target) => (await audit(target)).overlayMounts,
    toastMounts: async (target) => (await audit(target)).toastMounts,
  };
}

async function prepareRapidSubmit(
  page: Page,
  completeRequest = false,
  holdUpload = false,
): Promise<{
  fixture: RapidClickFixture;
  cta: ReturnType<Page['getByRole']>;
}> {
  const fixture = await installRapidClickFixture(page, completeRequest, holdUpload);
  const { filePath, fileName } = makeUniqueResumePdf();
  await page.goto('/upload');
  await page.locator('#file-input').setInputFiles(filePath);
  await expect(page.getByText(fileName)).toBeVisible();
  return {
    fixture,
    cta: page.getByRole('button', { name: 'Analyze Resume', exact: true }),
  };
}

async function assertSingleVisibleAttempt(page: Page, fixture: RapidClickFixture): Promise<void> {
  await expect.poll(fixture.requestCount, { timeout: 30_000 }).toBe(1);
  await expect(page.getByRole('dialog', { name: 'Analyzing your resume' })).toHaveCount(1);
  expect(await fixture.overlayMounts(page)).toBe(1);
  expect(await fixture.toastMounts(page)).toBe(0);
  await assertNoLeak(page, 'rapid submit');
}

// The Node-side admin client and the merit / rate-limit resets these tests depend on were
// hoisted into `e2e/helpers/test-user.ts` by 09-09 (D9-04) and are now also invoked once per
// run from `e2e/global-setup.ts`, so EVERY merit-spending spec starts from a known balance
// rather than only this one. They are still called explicitly below: this spec drives a real
// analysis in the SAME run as `resume-analysis.spec.ts` (fullyParallel), and it must not
// depend on which of them happens to go first for its submit to be affordable.

const testUserId = (admin: Parameters<typeof seedMerits>[0]) =>
  requireTestUserId(admin, E2E_TEST_EMAIL);

/** Two INDEPENDENT browser contexts for the same authenticated user = a genuine two-tab test. */
async function openTwoTabs(browser: Browser) {
  const ctxA = await browser.newContext({ storageState: AUTH_STATE });
  const ctxB = await browser.newContext({ storageState: AUTH_STATE });
  await Promise.all([
    mockValidDocumentResponse(ctxA),
    mockValidDocumentResponse(ctxB),
  ]);
  return { ctxA, ctxB, pageA: await ctxA.newPage(), pageB: await ctxB.newPage() };
}

test.describe('one-click integrity @xdev', () => {
  test('rapid double activation creates one request and one waiting surface', async ({
    page,
  }, testInfo) => {
    const { fixture, cta } = await prepareRapidSubmit(page);
    if (testInfo.project.name.startsWith('mobile-')) {
      await Promise.all([cta.tap({ force: true }), cta.tap({ force: true })]);
    } else {
      await cta.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    }
    await assertSingleVisibleAttempt(page, fixture);
  });

  test('one request completes through the same surface and releases it', async ({ page }) => {
    const { fixture, cta } = await prepareRapidSubmit(page, true);
    await cta.evaluate((button: HTMLButtonElement) => button.click());

    await expect.poll(fixture.requestCount, { timeout: 30_000 }).toBe(1);
    await expect(page.getByRole('dialog', { name: 'Analyzing your resume' })).toHaveCount(1);
    fixture.releaseCompletion();
    await expect(
      page.getByRole('heading', { name: /resume screening report/i }),
    ).toBeVisible({ timeout: 60_000 });
    expect(fixture.requestCount()).toBe(1);
    await expect(page.getByRole('dialog', { name: 'Analyzing your resume' })).toHaveCount(0);
    expect(await fixture.overlayMounts(page)).toBe(1);
    expect(await fixture.toastMounts(page)).toBe(0);
    await assertNoLeak(page, 'completed rapid submit');
  });

  test('rapid triple activation and an in-flight click create no second attempt', async ({
    page,
  }) => {
    const { fixture, cta } = await prepareRapidSubmit(page, false, true);
    const ctaHandle = await cta.elementHandle();
    expect(ctaHandle).not.toBeNull();
    await ctaHandle!.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
      button.click();
    });
    await expect.poll(() => ctaHandle!.getAttribute('aria-disabled')).toBe('true');
    await ctaHandle!.evaluate((button: HTMLButtonElement) => button.click());
    fixture.releaseUpload();
    await page.waitForTimeout(250);
    await assertSingleVisibleAttempt(page, fixture);
  });

  test('rapid Enter and Space activation on the aria-disabled CTA stay collapsed', async ({
    page,
  }) => {
    const { fixture, cta } = await prepareRapidSubmit(page, false, true);
    const ctaHandle = await cta.elementHandle();
    expect(ctaHandle).not.toBeNull();
    await ctaHandle!.focus();
    await ctaHandle!.press('Enter');
    await expect.poll(() => ctaHandle!.getAttribute('aria-disabled')).toBe('true');
    await ctaHandle!.press('Enter');
    await ctaHandle!.press('Space');
    await ctaHandle!.press('Space');
    fixture.releaseUpload();
    await page.waitForTimeout(250);
    await assertSingleVisibleAttempt(page, fixture);
  });
});

test.describe('S-20 two simultaneous browser tabs (cross-context)', () => {
  test('one submit with TWO live tabs open creates EXACTLY ONE analysis and AT MOST ONE merit debit', async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const admin = adminClient();
    const userId = await testUserId(admin);
    await seedMerits(admin, userId);
    await resetAnalyzeResumeRateLimit(admin, userId);
    const windowStart = new Date().toISOString();

    // The document tab A will submit. Generated UP FRONT because its unique file_name is what
    // scopes the durable assertions below to THIS run: the seeded E2E user is SHARED and
    // Playwright runs spec files in parallel workers, so `resume-analysis.spec.ts` may be
    // driving its own real analysis for the same user at the same moment. A user-wide row
    // count would see that other spec's row and read "2" for a one-submit invariant.
    const { filePath, fileName } = makeUniqueResumePdf();

    const { ctxA, ctxB, pageA, pageB } = await openTwoTabs(browser);

    try {
      // Tab B is a genuine SIMULTANEOUS second tab: authenticated, sitting on the same
      // feature, live for the entire duration of tab A's analysis.
      await pageB.goto('/upload');
      await expect(pageB).toHaveURL(/\/upload/);

      // Tab A performs the ONE deliberate submit — with a never-before-seen content hash,
      // so this is a REAL new run and not Upload's file_hash dedup short-circuit.
      await pageA.goto('/upload');
      await pageA.locator('#file-input').setInputFiles(filePath);
      await expect(pageA.getByText(fileName)).toBeVisible();
      await pageA.getByRole('button', { name: 'Analyze Resume', exact: true }).click();

      await expect(pageA).toHaveURL(/\/results\//, { timeout: 60_000 });
      // D9-09: if the report never renders, the usual cause is a LIVE Anthropic call that timed
      // out (AI_TEST_MODE off on the TEST project), not a code regression. Catch the bare
      // visibility timeout and, when the run died on a live-only failure code, rethrow with the
      // real cause named — so this can never again masquerade as a mystery gate failure.
      try {
        await expect(
          pageA.getByRole('heading', { name: /resume screening report/i }),
        ).toBeVisible({ timeout: 90_000 });
      } catch (err) {
        const diagnosis = await diagnoseLiveAnthropic(admin, userId, windowStart);
        if (diagnosis) throw new Error(diagnosis, { cause: err });
        throw err;
      }

      // Tab B never submitted, so it must not have navigated itself into a run. A second
      // tab that auto-triggers or mirrors the submit is the regression this catches.
      await expect(pageB).toHaveURL(/\/upload/);

      // THE INVARIANT: one submit, two live tabs -> exactly ONE analysis OF THIS DOCUMENT.
      //
      // Poll for CONVERGENCE first: the Results page renders from the SSE stream, so the
      // durable `resumes.grading_data` write settles a moment after the heading appears.
      // The invariant is "exactly one", not "instantly one" — so we wait for the write to
      // land...
      await expect
        .poll(async () => analyzedResumeCountForFile(admin, userId, fileName), {
          timeout: 60_000,
          intervals: [1_000],
          message: 'the one submit must durably persist exactly one completed analysis',
        })
        .toBe(1);

      // ...and then hold, to prove it STAYS one. A second tab that duplicated the run would
      // land a late second row here — this is the assertion that actually catches it.
      await pageA.waitForTimeout(5_000);
      expect(
        await analyzedResumeCountForFile(admin, userId, fileName),
        'one submit with two live tabs must settle at exactly ONE completed analysis (no late duplicate run)',
      ).toBe(1);

      // THE FINANCIAL INVARIANT: one submit must never be charged TWICE.
      //
      // CORRECTED IN 09-09. This previously read the USER-WIDE debit delta and asserted it was
      // <= 1, under an in-source claim that "when the merit system is dormant no debit rows are
      // written at all". That claim is FALSE on the TEST project: a free-tier resume analysis
      // really does write a -3 `feature-deduct` row. The assertion only ever looked green
      // because it was the sole spec driving an analysis — the moment `resume-analysis.spec.ts`
      // started driving a genuine one too (D9-03), the user-wide delta hit 2 and this went RED
      // for a reason that had nothing to do with double-charging.
      //
      // The ledger already carries the right key: `idempotency_key` is derived from the INPUT
      // IDENTITY, so each document gets its own, and a cross-tab re-fire of the SAME submit
      // reuses it. So the invariant is asserted where it actually lives — NO key may carry more
      // than one debit. That is immune to any number of parallel specs (they bring their own
      // keys) and is strictly sharper than a count: it fails on a genuine double-charge and on
      // nothing else.
      const debitKeys = await meritDebitKeyMultiplicity(admin, userId, windowStart);

      // Non-vacuity: the merit path must actually have CHARGED in this window. If this is 0 the
      // ledger is not writing, and the invariant below would be asserting over an empty set —
      // a green that proves nothing, which is the exact failure class this phase keeps finding.
      expect(
        debitKeys.size,
        'the merit ledger must have written at least one debit in this window (a vacuous ' +
          'financial assertion over zero rows is not a financial assertion)',
      ).toBeGreaterThanOrEqual(1);

      const doubleCharged = [...debitKeys.entries()].filter(([, count]) => count > 1);
      expect(
        doubleCharged,
        'one submit must never charge twice, even with a second browser context live ' +
          `(these idempotency keys carry more than one debit: ${JSON.stringify(doubleCharged)})`,
      ).toEqual([]);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // QUARANTINE(S-20-LIFECYCLE-DORMANT, phase-09-executor, 2026-10-11 expiry): NOT flaky —
  // environment-gated. Cross-context run_id recovery requires the analysis lifecycle to be
  // ACTIVE (VITE_FEATURE_ANALYSIS_LIFECYCLE=true in the E2E build + ANALYSIS_LIFECYCLE_*
  // on the TEST project's edge functions) and the merit ledger to be writing
  // (MERIT_SYSTEM_ENABLED). Both ship DORMANT in the E2E environment by design (D-03), so
  // `startRun` no-ops, no run_id is ever persisted, and there is nothing for tab B to
  // recover. Un-skip when the activation plans (D-01/D-02) flip the flags; the assertions
  // below are complete and are the real T-09-06-A proof. Runs in the visible non-blocking
  // lane; registered in TESTING-STRATEGY.md's quarantine register.
  test.skip('QUARANTINE: tab B recovers tab A\'s SAME run_id and the run carries exactly ONE merit debit', async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    const admin = adminClient();
    const userId = await testUserId(admin);
    await seedMerits(admin, userId);
    await resetAnalyzeResumeRateLimit(admin, userId);
    const { ctxA, ctxB, pageA, pageB } = await openTwoTabs(browser);

    try {
      // Tab A submits and, with the lifecycle ON, persists the run_id (URL + localStorage).
      const { filePath } = makeUniqueResumePdf();
      await pageA.goto('/upload');
      await pageA.locator('#file-input').setInputFiles(filePath);
      await pageA.getByRole('button', { name: 'Analyze Resume', exact: true }).click();
      await expect(pageA).toHaveURL(/\/results\//, { timeout: 60_000 });

      // useAnalysisRun.startRun writes run_id to the URL param AND localStorage.
      const runId = await pageA.evaluate(
        () => localStorage.getItem('strivio.analysis.run_id'),
      );
      expect(runId, 'tab A must persist a run_id once the lifecycle is active').toBeTruthy();

      // Tab B is an INDEPENDENT storage origin — it cannot see tab A's localStorage. It
      // re-attaches through the server (get-analysis-run-status is owner-scoped), which is
      // the strongest form of the recovery proof: it survives a fresh storage origin.
      const statusResponse = pageB.waitForResponse(
        (res) => res.url().includes('/functions/v1/get-analysis-run-status'),
        { timeout: 30_000 },
      );
      await pageB.goto(`/results/${runId}?run_id=${runId}`);
      const status = await statusResponse;
      expect(status.status()).toBe(200);

      // Tab B ATTACHES to tab A's run — it does not start a second one.
      const recovered = await pageB.evaluate(
        () => localStorage.getItem('strivio.analysis.run_id'),
      );
      expect(recovered, 'tab B must recover the SAME run_id, never mint a new run').toBe(runId);

      // THE FINANCIAL INVARIANT (T-09-06-A): exactly ONE debit for that run's key.
      const { data: run } = await admin
        .from('analysis_jobs')
        .select('idempotency_key')
        .eq('id', runId as string)
        .single();
      const idempotencyKey = (run as { idempotency_key: string | null } | null)?.idempotency_key;
      expect(idempotencyKey, 'the run must carry the derived idempotency key').toBeTruthy();

      const { count } = await admin
        .from('merit_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('idempotency_key', idempotencyKey as string)
        .lt('amount', 0);
      expect(count, 'exactly ONE debit may exist for one run, across any number of tabs').toBe(1);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });
});
