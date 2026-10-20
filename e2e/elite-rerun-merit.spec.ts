/**
 * Elite resume-RERUN merit flow — LIVE browser verification (quick task 260723-2b0, Task 11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  GATED — DOES NOT RUN IN verify:baseline / the normal `test:e2e` gate.
 * ─────────────────────────────────────────────────────────────────────────────
 * This spec exercises the Merit charge/idempotency path, which is only live when
 * `MERIT_SYSTEM_ENABLED=true` on the target project. Preview normally runs with the
 * merit system OFF (see MEMORY: "Preview merit system is OFF"), so an UNGATED spec would
 * flake the blocking suite the moment merits are flipped back off. It therefore runs ONLY
 * when RUN_MERIT_E2E=1 is explicitly set (mirrors the repo's quarantine pattern), against a
 * project that has MERIT_SYSTEM_ENABLED=true. Normal runs use AI_TEST_MODE=true
 * (server-side AI stub); EXPECT_REAL_AI_TELEMETRY=1 additionally proves the
 * preview-only real-provider telemetry contract while AI_TEST_MODE is temporarily false.
 *
 *   RUN_MERIT_E2E=1 npx playwright test e2e/elite-rerun-merit.spec.ts
 *
 * WHAT IT PROVES (scope: merit + UI, AI stubbed — real eliteInsights content and live
 * cost/latency telemetry are OUT OF SCOPE under AI_TEST_MODE):
 *   1. The "Unlock Elite insights — N merits" CTA renders on an Elite account viewing a
 *      Free-tier analysis, with N read from merit_feature_costs (NOT hardcoded), and the
 *      gated (non-full) layout is shown.
 *   2. Clicking the CTA charges EXACTLY the DB cost once (one feature-deduct ledger row).
 *   4. The original `resumes` row is upgraded in place and remains on the same /results/:id.
 *   6. A Free account sees NO CTA and its Free analysis carries no elite-only fields.
 * (Steps 3 "idempotent replay" and 5 "client tamper 42501" are Postgres-level invariants
 * proven by the companion API-level driver; this spec focuses on what the BROWSER owns.)
 *
 * SECURITY: SUPABASE_TEST_SERVICE_ROLE_KEY is read in the NODE process only (the
 * e2e/global-setup.ts precedent) and NEVER passed to page.evaluate / addInitScript / any
 * browser-visible surface. The browser holds only the anon-key session it logs in with.
 * Synthetic personas only (@strivo.test — never real user data).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const RUN = process.env.RUN_MERIT_E2E === '1';
const EXPECT_REAL_AI_TELEMETRY = process.env.EXPECT_REAL_AI_TELEMETRY === '1';
const liveUserIds = new Set<string>();

const ELITE_UNLOCK_STAGE_COPY = [
  'Checking this analysis',
  'Reserving your credits',
  'Generating missing Elite insights',
  'Checking the new insights',
  'Saving your Elite analysis',
] as const;

const ELITE_UNLOCK_CALL_NAMES = [
  'elite-unlock-details',
  'elite-unlock-extras',
] as const;

const URL = process.env.SUPABASE_TEST_URL;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const BROWSER_SUPABASE_URL = process.env.VITE_SUPABASE_URL;

// Fresh browser context — do NOT inherit the baseline user's storageState (this spec logs
// in as its OWN dedicated per-run users so it never mutates the shared baseline user).
test.use({ storageState: { cookies: [], origins: [] } });

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

const SYNTHETIC_USER_ID = '00000000-0000-4000-8000-000000000317';
const SYNTHETIC_SOURCE_ID = '00000000-0000-4000-8000-000000000318';
const SYNTHETIC_USER = {
  id: SYNTHETIC_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'elite-rerun@example.invalid',
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

function completedSyntheticResume(id: string, analyzedTier: 'free' | 'elite') {
  return {
    id,
    user_id: SYNTHETIC_USER_ID,
    file_name: 'elite-rerun.pdf',
    file_url: 'https://example.invalid/elite-rerun.pdf',
    file_path: `${SYNTHETIC_USER_ID}/elite-rerun.pdf`,
    file_hash: 'synthetic-file-hash',
    file_size: 4242,
    extracted_text: RESUME_TEXT,
    text_hash: 'synthetic-text-hash',
    overall_score: 78,
    analyzed_tier: analyzedTier,
    created_at: '2026-01-01T00:00:00.000Z',
    grading_data: {
      overallScore: 78,
      criterionFeedback: [
        { label: 'Impact & Achievements', weight: 25, score: 8, highlights: [] },
      ],
      strengths: ['Consistent formatting throughout.'],
      priorityImprovements: ['Add measurable outcomes to each role.'],
    },
  };
}

interface SyntheticRerunFixture {
  analyzeRequests(): number;
  resumeWriteRequests(): number;
  requestBodies(): readonly Record<string, unknown>[];
  releaseAnalyze(): void;
}

/**
 * This local fixture proves browser-owned request integrity only. Preview has the Merit
 * system disabled, so the actual debit delta remains operator production pass P-1.
 * Request bodies stay in memory for comparison and are never logged or attached.
 */
async function installSyntheticRerunFixture(page: Page): Promise<SyntheticRerunFixture> {
  let analyzeRequests = 0;
  let resumeWriteRequests = 0;
  let unlockCompleted = false;
  const requestBodies: Record<string, unknown>[] = [];
  let resolveAnalyze = () => {};
  const analyzeGate = new Promise<void>((resolve) => {
    resolveAnalyze = resolve;
  });

  await page.addInitScript(
    ({ accessToken, authStorageKey, user }) => {
      const session = {
        access_token: accessToken,
        refresh_token: 'synthetic-refresh-token',
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
    },
    {
      accessToken: SYNTHETIC_ACCESS_TOKEN,
      authStorageKey: BROWSER_SUPABASE_URL
        ? `sb-${BROWSER_SUPABASE_URL.split('://')[1].split('.')[0]}-auth-token`
        : '',
      user: SYNTHETIC_USER,
    },
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
  await page.route('**/rest/v1/merit_feature_costs*', (route) =>
    fulfillJson(route, [{ feature: 'resume_analysis', tier: 'elite', cost: 5 }]),
  );
  await page.route('**/rest/v1/career_targets*', (route) =>
    fulfillJson(route, { professional_goal: 'Senior Software Engineer' }),
  );
  await page.route('**/rest/v1/improvement_checklist*', (route) => fulfillJson(route, []));
  await page.route('**/rest/v1/profiles*', (route) =>
    fulfillJson(route, { id: SYNTHETIC_USER_ID, subscription_tier: 'elite' }),
  );
  await page.route('**/rest/v1/user_merits*', (route) =>
    fulfillJson(route, { subscription_balance: 20, shop_balance: 0 }),
  );
  await page.route('**/rest/v1/resumes*', async (route) => {
    const request = route.request();
    const url = request.url();
    if (request.method() === 'POST') {
      resumeWriteRequests += 1;
      await fulfillJson(route, { id: SYNTHETIC_SOURCE_ID });
      return;
    }
    if (url.includes('select=id&') && url.includes('user_id=eq.')) {
      await fulfillJson(route, [{ id: SYNTHETIC_SOURCE_ID }]);
      return;
    }
    if (url.includes(`id=eq.${SYNTHETIC_SOURCE_ID}`)) {
      await fulfillJson(
        route,
        completedSyntheticResume(SYNTHETIC_SOURCE_ID, unlockCompleted ? 'elite' : 'free'),
      );
      return;
    }
    await fulfillJson(route, []);
  });
  await page.route('**/functions/v1/analyze-resume', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { ...CORS } });
      return;
    }
    analyzeRequests += 1;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requestBodies.push(body);
    await analyzeGate;
    unlockCompleted = true;
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { ...CORS },
      body: `data: ${JSON.stringify({
        type: 'complete',
        result: completedSyntheticResume(String(body.resumeId), 'elite').grading_data,
      })}\n\n`,
    });
  });

  return {
    analyzeRequests: () => analyzeRequests,
    resumeWriteRequests: () => resumeWriteRequests,
    requestBodies: () => requestBodies,
    releaseAnalyze: () => resolveAnalyze(),
  };
}

function admin(): SupabaseClient {
  return createClient(URL as string, SERVICE as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const RESUME_TEXT = [
  'JORDAN MERIT-VERIFY — Senior Software Engineer — jordan@example.com',
  'SUMMARY: Backend engineer, 8 years, distributed systems + payments.',
  'EXPERIENCE: Staff Engineer at Acme (2020-2026); Engineer at Globex (2016-2020).',
  'SKILLS: TypeScript, Go, Postgres, Kafka, AWS. EDUCATION: BS CS, 2016.',
].join('\n');

/** Create a confirmed user, seed merits + tier, return anon session token. */
async function makeUser(a: SupabaseClient, tag: string, balance: number) {
  const email = `merit-e2e-${tag}-${Date.now()}@strivo.test`;
  const password = 'Test-' + crypto.randomUUID();
  const { data, error } = await a.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  const userId = data.user!.id;
  liveUserIds.add(userId);
  await a.from('profiles').update({ subscription_tier: 'free' }).eq('id', userId);
  const upd = await a.from('user_merits').update({ subscription_balance: balance, shop_balance: 0 })
    .eq('user_id', userId).select('user_id');
  if (!upd.data || upd.data.length === 0) {
    await a.from('user_merits').insert({ user_id: userId, subscription_balance: balance, shop_balance: 0 });
  }
  // ProtectedRoute's onboarding gate requires a resume AND a non-empty
  // career_targets.professional_goal (quick 260712-msh) — without it the user is bounced to
  // /onboarding Step 4. Seed the goal (mirrors e2e/global-setup.ts step 4), never weaken the gate.
  await a.from('career_targets').upsert(
    { user_id: userId, professional_goal: 'E2E merit-rerun goal — Software Engineering 2027', professional_goal_set_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  return { email, password, userId };
}

/** Insert a resume row as the USER (anon client + JWT) — the browser's own write path. */
async function seedResumeAsUser(email: string, password: string, userId: string, text: string) {
  const user = createClient(URL as string, ANON as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: sess, error: sErr } = await user.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error('signIn: ' + sErr.message);
  const token = sess.session!.access_token;
  const uniq = crypto.randomUUID();
  const { data, error } = await user.from('resumes').insert({
    user_id: userId,
    file_name: `merit-e2e-${uniq}.pdf`,
    file_url: `https://example.com/${uniq}.pdf`,
    file_path: `${userId}/${uniq}.pdf`,
    file_hash: sha256('file-' + uniq),
    file_size: 4242,
    extracted_text: text,
    text_hash: sha256(text),
    document_hash: sha256(text),
  }).select('id').single();
  if (error) throw new Error('resume insert: ' + error.message);
  return { resumeId: data.id as string, token };
}

/** Drive the REAL deployed analyze-resume streaming endpoint to completion (server AI stub). */
async function analyze(token: string, resumeId: string, userId: string, text: string, tier: string) {
  const res = await fetch(`${URL}/functions/v1/analyze-resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: ANON as string, 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeId, resumeText: text, userId, tier, previousSuggestions: [], previousScore: null, attemptNonce: crypto.randomUUID(), stream: true }),
  });
  if (res.body) { const r = res.body.getReader(); for (;;) { const { done } = await r.read(); if (done) break; } }
  return res.status;
}

async function pollGrading(a: SupabaseClient, resumeId: string, timeoutMs = 30000) {
  const t0 = Date.now();
  for (;;) {
    const { data } = await a.from('resumes').select('id, analyzed_tier, grading_data').eq('id', resumeId).maybeSingle();
    if (data && (data as { grading_data?: unknown }).grading_data != null) return data;
    if (Date.now() - t0 > timeoutMs) return data ?? null;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function pollAnalyzedTier(
  a: SupabaseClient,
  resumeId: string,
  expectedTier: 'free' | 'elite',
  timeoutMs = 30000,
) {
  const t0 = Date.now();
  for (;;) {
    const { data } = await a.from('resumes')
      .select('id, analyzed_tier, grading_data')
      .eq('id', resumeId)
      .maybeSingle();
    if ((data as { analyzed_tier?: string } | null)?.analyzed_tier === expectedTier) return data;
    if (Date.now() - t0 > timeoutMs) return data ?? null;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function expectFreeOwnedValuesPreserved(
  before: Record<string, any>,
  after: Record<string, any>,
): void {
  const additiveTopLevel = new Set([
    'priorityImprovements',
    'rewriteSuggestions',
    'industryGuess',
    'suggestedTargetRoles',
    'recommendedKeywords',
    'eliteInsights',
    'criterionFeedback',
  ]);
  for (const [key, value] of Object.entries(before)) {
    if (!additiveTopLevel.has(key)) expect(after[key], `immutable field ${key}`).toEqual(value);
  }

  const beforeImprovements = Array.isArray(before.priorityImprovements) ? before.priorityImprovements : [];
  const afterImprovements = Array.isArray(after.priorityImprovements) ? after.priorityImprovements : [];
  expect(afterImprovements.slice(0, beforeImprovements.length)).toEqual(beforeImprovements);

  const beforeRewrites = Array.isArray(before.rewriteSuggestions) ? before.rewriteSuggestions : [];
  const afterRewrites = Array.isArray(after.rewriteSuggestions) ? after.rewriteSuggestions : [];
  expect(afterRewrites.slice(0, beforeRewrites.length)).toEqual(beforeRewrites);

  const afterCriteria = Array.isArray(after.criterionFeedback) ? after.criterionFeedback : [];
  for (const beforeCriterion of Array.isArray(before.criterionFeedback) ? before.criterionFeedback : []) {
    const afterCriterion = afterCriteria.find((value: any) => value?.id === beforeCriterion?.id);
    expect(afterCriterion, `criterion ${beforeCriterion?.id ?? 'unknown'} remains present`).toBeTruthy();
    if (beforeCriterion?.feedback == null) {
      const { feedback: _beforeFeedback, ...beforeImmutable } = beforeCriterion;
      const { feedback: _afterFeedback, ...afterImmutable } = afterCriterion;
      expect(afterImmutable).toEqual(beforeImmutable);
    } else {
      expect(afterCriterion).toEqual(beforeCriterion);
    }
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
}

test.describe('deliberate Elite rerun integrity @xdev', () => {
  test('rapid activations collapse and completion stays on the same resume row', async ({
    page,
  }) => {
    const fixture = await installSyntheticRerunFixture(page);
    await page.goto(`/results/${SYNTHETIC_SOURCE_ID}`);
    const rerun = page.getByRole('button', { name: 'Unlock Elite insights — 5 merits' });
    await expect(rerun).toBeVisible({ timeout: 30_000 });
    const rerunHandle = await rerun.elementHandle();
    expect(rerunHandle).not.toBeNull();

    // Two activations in the same browser task may start only one unlock request.
    await rerunHandle!.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect.poll(fixture.analyzeRequests, { timeout: 30_000 }).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/results/${SYNTHETIC_SOURCE_ID}\\?stream=true&unlock=`));
    expect(fixture.resumeWriteRequests()).toBe(0);
    expect(fixture.requestBodies()).toEqual([
      { mode: 'elite_unlock', resumeId: SYNTHETIC_SOURCE_ID, stream: true },
    ]);

    fixture.releaseAnalyze();
    await expect(page).toHaveURL(new RegExp(`/results/${SYNTHETIC_SOURCE_ID}$`), {
      timeout: 30_000,
    });
    await expect(page.getByRole('heading', { name: /resume screening report/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unlock Elite insights/ })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: /resume screening report/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Unlock Elite insights/ })).toHaveCount(0);
    expect(fixture.analyzeRequests()).toBe(1);
    expect(fixture.resumeWriteRequests()).toBe(0);
  });
});

test.describe('Elite resume-rerun merit flow (gated: RUN_MERIT_E2E=1)', () => {
  test.skip(!RUN, 'Gated — set RUN_MERIT_E2E=1 against a MERIT_SYSTEM_ENABLED + AI_TEST_MODE project.');
  test.skip(!URL || !SERVICE || !ANON, 'Missing SUPABASE_TEST_* / VITE_SUPABASE_ANON_KEY.');

  test.afterEach(async () => {
    if (!URL || !SERVICE) return;
    const a = admin();
    for (const userId of liveUserIds) {
      await a.auth.admin.deleteUser(userId).catch(() => {});
      liveUserIds.delete(userId);
    }
  });

  test('Elite account: CTA renders with DB-sourced cost, one charge, and same-row persistence', async ({ page }) => {
    test.setTimeout(EXPECT_REAL_AI_TELEMETRY ? 600_000 : 180_000);
    const a = admin();

    // Seed a completed FREE analysis via the REAL deployed function (server AI stub).
    const u = await makeUser(a, 'elite', 20);
    const { resumeId: freeId, token } = await seedResumeAsUser(u.email, u.password, u.userId, RESUME_TEXT + `\n[${u.userId}]`);
    expect(await analyze(token, freeId, u.userId, RESUME_TEXT + `\n[${u.userId}]`, 'free')).toBe(200);
    const freeRow = await pollGrading(a, freeId);
    expect((freeRow as { analyzed_tier?: string })?.analyzed_tier).toBe('free');

    const { data: baseCandidates, error: baseCandidatesError } = await a.from('analysis_results')
      .select('id, raw_response')
      .eq('user_id', u.userId)
      .eq('source_reference', freeId)
      .eq('analysis_type', 'resume_analysis');
    expect(baseCandidatesError).toBeNull();
    const storedResult = (freeRow as { grading_data: Record<string, unknown> }).grading_data;
    const storedWithoutMetadata = { ...storedResult };
    delete storedWithoutMetadata.metadata;
    const baseDiagnostics = (baseCandidates ?? []).map((candidate) => {
      const mirror = candidate.raw_response as Record<string, unknown>;
      const mirrorWithoutMetadata = { ...mirror };
      delete mirrorWithoutMetadata.metadata;
      return {
        tier: (mirror.metadata as { tier?: unknown } | undefined)?.tier ?? null,
        storedKeys: Object.keys(storedWithoutMetadata).sort(),
        mirrorKeys: Object.keys(mirrorWithoutMetadata).sort(),
        exactMatch: JSON.stringify(storedWithoutMetadata) === JSON.stringify(mirrorWithoutMetadata),
      };
    });
    expect(
      baseDiagnostics.some((candidate) => candidate.tier === 'free' && candidate.exactMatch),
      `Free base mirror diagnostics: ${JSON.stringify(baseDiagnostics)}`,
    ).toBe(true);

    // Cost the CTA MUST display — read from the DB so the assertion below proves the number
    // is data-sourced, not hardcoded in the component.
    const { data: costRow } = await a.from('merit_feature_costs').select('cost').eq('feature', 'resume_analysis').eq('tier', 'elite').single();
    const cost = (costRow as { cost: number }).cost;

    // Flip the ACCOUNT to Elite. Now an Elite account is viewing a Free-tier analysis.
    await a.from('profiles').update({ subscription_tier: 'elite' }).eq('id', u.userId);

    // ── STEP 1: CTA renders (DB cost) + gated layout ─────────────────────────
    await login(page, u.email, u.password);
    await page.goto(`/results/${freeId}`);
    const ctaButton = page.getByRole('button', { name: `Unlock Elite insights — ${cost} merits` });
    await expect(ctaButton).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Unlock the rest of your Elite analysis' })).toBeVisible();
    await expect(page.getByText('Add only the missing Elite insights to this result. Your existing Free analysis won’t change.')).toBeVisible();
    // Gated (non-full) layout: an Elite account viewing a Free analysis is told to RERUN to
    // unlock, not "Upgrade" — this label only renders when showFullResults is false.
    await expect(page.getByText('Rerun with Elite to unlock 4 more improvements')).toBeVisible();

    // ── STEP 2: exactly one charge ───────────────────────────────────────────
    const before = (await a.from('user_merits').select('subscription_balance').eq('user_id', u.userId).single()).data as { subscription_balance: number };
    const since = new Date().toISOString();
    const unlockResponsePromise = page.waitForResponse((response) =>
      response.url().includes('/functions/v1/analyze-resume') &&
      response.request().method() === 'POST'
    );
    await ctaButton.click();
    const unlockDialog = page.getByRole('dialog', { name: 'Unlocking Elite insights' });
    await expect(unlockDialog).toBeVisible({ timeout: 30_000 });
    const unlockStageList = unlockDialog.getByTestId('analysis-stage-list');
    for (const label of ELITE_UNLOCK_STAGE_COPY) {
      await expect(unlockStageList.getByText(label, { exact: true })).toBeVisible();
    }
    const unlockResponse = await unlockResponsePromise;
    const unlockRequestBody = unlockResponse.request().postDataJSON() as Record<string, unknown>;
    const unlockResponseBody = unlockResponse.status() >= 400
      ? await unlockResponse.json().catch(() => null)
      : null;
    await expect(page).toHaveURL(new RegExp(`/results/${freeId}\\?stream=true&unlock=`), {
      timeout: 30_000,
    });
    // Wait for the same row to receive the Elite delta and authoritative tier promotion.
    const eliteRow = await pollAnalyzedTier(a, freeId, 'elite');
    const { data: runDiagnostics } = await a.from('analysis_jobs')
      .select('state, status, failure_code, failure_stage, refunded, merit_settled')
      .eq('user_id', u.userId)
      .eq('resume_id', freeId)
      .eq('feature', 'resume_analysis')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(
      (eliteRow as { analyzed_tier?: string })?.analyzed_tier,
      `Elite unlock request identity: ${JSON.stringify({ resumeId: unlockRequestBody.resumeId, baseAnalysisId: unlockRequestBody.baseAnalysisId ?? null, mode: unlockRequestBody.mode })}; response: ${unlockResponse.status()} ${JSON.stringify(unlockResponseBody)}; lifecycle: ${JSON.stringify(runDiagnostics)}`,
    ).toBe('elite');

    const eliteGrading = (eliteRow as { grading_data: Record<string, any> }).grading_data;
    expectFreeOwnedValuesPreserved(storedResult, eliteGrading);

    const after = (await a.from('user_merits').select('subscription_balance').eq('user_id', u.userId).single()).data as { subscription_balance: number };
    const { data: deducts } = await a.from('merit_transactions')
      .select('idempotency_key, amount, metadata')
      .eq('user_id', u.userId).eq('source', 'feature-deduct').gte('created_at', since);
    expect(before.subscription_balance - after.subscription_balance).toBe(cost);
    expect((deducts ?? []).length).toBe(1);
    expect((deducts as Array<{ idempotency_key: string }>)[0].idempotency_key).toBeTruthy();

    const { data: incrementalMirrors } = await a.from('analysis_results')
      .select('id, key_insights')
      .eq('user_id', u.userId)
      .eq('source_reference', freeId)
      .eq('analysis_type', 'resume_analysis')
      .contains('key_insights', { generation_mode: 'incremental_unlock' });
    expect(incrementalMirrors).toHaveLength(1);
    const incrementalAnalysisId = (incrementalMirrors as Array<{ id: string }>)[0].id;
    const { data: linkedUsage } = await a.from('usage_tracking')
      .select('id, analysis_id, credits_consumed')
      .eq('user_id', u.userId)
      .eq('analysis_id', incrementalAnalysisId);
    expect(linkedUsage).toHaveLength(1);
    expect((linkedUsage as Array<{ credits_consumed: number }>)[0].credits_consumed).toBe(cost);

    if (EXPECT_REAL_AI_TELEMETRY) {
      const { data: telemetryRows, error: telemetryError } = await a.from('ai_call_telemetry')
        .select('id, created_at, feature, tier, call_name, attempt, req_id, user_id, model, max_tokens, input_tokens, output_tokens, stop_reason, ok, http_status, duration_ms, ttfb_ms, output_chars, headroom_pct, truncated')
        .eq('user_id', u.userId)
        .gte('created_at', since)
        .in('call_name', [...ELITE_UNLOCK_CALL_NAMES])
        .order('created_at', { ascending: true });
      expect(telemetryError).toBeNull();
      expect(telemetryRows).toHaveLength(2);
      expect((telemetryRows ?? []).map((row) => row.call_name).sort()).toEqual(
        [...ELITE_UNLOCK_CALL_NAMES].sort(),
      );
      for (const row of telemetryRows ?? []) {
        expect(row.feature).toBe('resume_analysis');
        expect(row.tier).toBe('elite');
        expect(row.max_tokens).toBe(6000);
        expect(row.input_tokens).toBeGreaterThan(0);
        expect(row.output_tokens).toBeGreaterThan(0);
        expect(row.output_chars).toBeGreaterThan(0);
        expect(row.ok).toBe(true);
        expect(row.truncated).toBe(false);
      }
    }

    // Explicit replay must resolve from durable state without another charge,
    // incremental mirror, or linked usage row.
    const replay = await fetch(`${URL}/functions/v1/analyze-resume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mode: 'elite_unlock', resumeId: freeId, stream: true }),
    });
    expect(replay.status).toBe(200);
    if (replay.body) {
      const reader = replay.body.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    const replayAfter = (await a.from('user_merits').select('subscription_balance').eq('user_id', u.userId).single()).data as { subscription_balance: number };
    const { count: replayDebitCount } = await a.from('merit_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.userId)
      .eq('source', 'feature-deduct')
      .gte('created_at', since);
    const { count: replayMirrorCount } = await a.from('analysis_results')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.userId)
      .eq('source_reference', freeId)
      .contains('key_insights', { generation_mode: 'incremental_unlock' });
    const { count: replayUsageCount } = await a.from('usage_tracking')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', u.userId)
      .eq('analysis_id', incrementalAnalysisId);
    expect(replayAfter.subscription_balance).toBe(after.subscription_balance);
    expect(replayDebitCount).toBe(1);
    expect(replayMirrorCount).toBe(1);
    expect(replayUsageCount).toBe(1);

    // STEP 4: completion stays on the same /results/:id.
    await page.goto(`/results/${freeId}`);
    await expect(page.getByRole('heading', { name: /resume screening report/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Unlock Elite insights/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Unlock the rest of your Elite analysis' })).toHaveCount(0, { timeout: 30_000 });
    await page.reload();
    await expect(page.getByRole('heading', { name: /resume screening report/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Unlock Elite insights/ })).toHaveCount(0);

    // cleanup
    await a.from('resumes').delete().eq('id', freeId);
    await a.auth.admin.deleteUser(u.userId).catch(() => {});
  });

  test('Free account: NO rerun CTA, no elite-only fields', async ({ page }) => {
    test.setTimeout(120_000);
    const a = admin();
    const u = await makeUser(a, 'free', 20);
    const text = RESUME_TEXT + `\n[free-${u.userId}]`;
    const { resumeId, token } = await seedResumeAsUser(u.email, u.password, u.userId, text);
    expect(await analyze(token, resumeId, u.userId, text, 'free')).toBe(200);
    const row = await pollGrading(a, resumeId);
    expect((row as { analyzed_tier?: string })?.analyzed_tier).toBe('free');
    // elite-only field must be absent/null on a Free analysis
    expect((row as { grading_data?: { eliteInsights?: unknown } })?.grading_data?.eliteInsights ?? null).toBeNull();

    await login(page, u.email, u.password);
    await page.goto(`/results/${resumeId}`);
    // Report heading proves the page rendered; the CTA must NOT be present for a Free account.
    await expect(page.getByRole('heading', { name: /resume screening report/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Unlock Elite insights/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Unlock the rest of your Elite analysis' })).toHaveCount(0);

    await a.from('resumes').delete().eq('id', resumeId);
    await a.auth.admin.deleteUser(u.userId).catch(() => {});
  });
});
