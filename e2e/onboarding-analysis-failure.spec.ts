/**
 * Free-user onboarding — HONEST FAILURE / RECOVERY behavior (Preview).
 *
 * Companion to onboarding-flow.spec.ts (the happy path). This spec exercises what the
 * user must NEVER experience silently: the automatic post-Step-4 analysis FAILING on the
 * first attempt. The legacy onboarding path is fire-and-forget — it navigates to Results
 * immediately and lets Results poll `resumes.grading_data`. If that first analysis fails,
 * the ONLY thing that can honestly tell the user is the client-side failure handler in
 * Onboarding.handleFinishSetup.
 *
 * We force a DETERMINISTIC server-side failure by pre-exhausting the fresh user's
 * `analyze-resume` rate-limit counter for the current window, so the analysis call returns
 * 429 (rate_limit_exceeded) instead of writing grading_data. This is a real edge-function
 * failure the code claims to handle — not a mock.
 *
 * HONEST-FAILURE CONTRACT (what this asserts):
 *   1. The user is TOLD the analysis failed (a failure toast), not left staring at a
 *      spinner that implies it is still working.
 *   2. No analysis is silently persisted and no duplicate row is created (real failure).
 *   3. The user is NOT trapped — they can reach the dashboard, where the saved resume
 *      remains recoverable.
 *
 * SECURITY / persona hygiene: identical to onboarding-flow.spec.ts — Node-only service
 * role, synthetic user on the RFC-2606 `strivo.test` domain, deleted in afterAll.
 */
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeUniqueResumePdf } from './fixtures/make-unique-resume';
import { mockValidDocumentResponse } from './helpers/mock-document-validator';
import { adminClient, resetAnalyzeResumeRateLimit } from './helpers/test-user';

test.use({ storageState: { cookies: [], origins: [] } });

const TARGET_ROLE = 'Software Engineering';
const TARGET_INDUSTRY = 'Technology';
const GOAL = 'Product Management role — 2027';

let admin: SupabaseClient;
let userId: string;
let email: string;
let password: string;

test.beforeAll(async () => {
  admin = adminClient();
  email = `e2e+onboard-fail-${randomUUID()}@strivo.test`;
  password = process.env.E2E_TEST_PASSWORD as string;
  expect(password, 'E2E_TEST_PASSWORD must be set').toBeTruthy();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user?.id) {
    throw new Error(`[onboarding-fail] could not create fresh user: ${error?.message ?? 'no id'}`);
  }
  userId = data.user.id;

  // Force a 429 on the onboarding analysis: seed the analyze-resume counter ABOVE any tier
  // limit for the CURRENT fixed window (windowStart(3600)). The edge fn increments then
  // rejects (counter > limit). The rate_key + window contract is the limiter's own
  // (_shared/rate-limiter.ts: `user:${uid}:analyze-resume`, floor(now/3600)*3600).
  const windowStart = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const { error: seedErr } = await admin.from('rate_limit_counters').insert({
    rate_key: `user:${userId}:analyze-resume`,
    window_start: windowStart,
    counter: 999,
  });
  if (seedErr) throw new Error(`[onboarding-fail] could not seed rate limit: ${seedErr.message}`);
});

test.afterAll(async () => {
  if (admin && userId) {
    await resetAnalyzeResumeRateLimit(admin, userId).catch(() => undefined);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }
});

test('failed first analysis is honest: user is told, nothing is silently persisted, not trapped', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await mockValidDocumentResponse(page);
  const { filePath, fileName } = makeUniqueResumePdf();

  await page.goto('/auth');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });

  await page.goto('/onboarding');
  await expect(page.getByText('Step 1 of 4')).toBeVisible({ timeout: 30_000 });

  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await expect(page.getByText(fileName)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('button', { name: 'Skip for now' }).click();

  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  await page.getByText(TARGET_ROLE, { exact: true }).click();
  await page.getByText(TARGET_INDUSTRY, { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await page.getByLabel('Set Your Professional Goal').fill(GOAL);
  await page.getByRole('button', { name: /Finish Setup/ }).click();

  // The onboarding writes (resume + goal) still succeed and the user is navigated to Results.
  await expect(page).toHaveURL(/\/results\//, { timeout: 30_000 });

  // ── CONTRACT 1: the user is TOLD the analysis failed ─────────────────────────────────
  // The legacy path's failure notification is the ONLY honest signal (Results otherwise
  // spins for 120s then shows a vague "taking longer" wall). This is the assertion that
  // fails when the handler is wired to `.catch()` on a promise that never rejects.
  await expect(page.getByText(/couldn't finish analyzing your resume/i)).toBeVisible({
    timeout: 15_000,
  });

  // ── CONTRACT 2: nothing silently persisted, no duplicate ─────────────────────────────
  // Give the (failed) request time to have NOT written anything, then assert 0 completed.
  await expect
    .poll(async () => completedCount(admin, userId), { timeout: 15_000, intervals: [1_000] })
    .toBe(0);
  const { data: resumeRows } = await admin
    .from('resumes')
    .select('id, grading_data')
    .eq('user_id', userId);
  expect(resumeRows?.length, 'exactly one resume row (the saved upload), no duplicate').toBe(1);
  expect(resumeRows?.[0]?.grading_data, 'no analysis persisted for a failed run').toBeNull();

  // ── CONTRACT 3: the user is NOT trapped ──────────────────────────────────────────────
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

async function completedCount(client: SupabaseClient, uid: string): Promise<number> {
  const { count, error } = await client
    .from('resumes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .not('grading_data', 'is', null);
  if (error) throw new Error(`[onboarding-fail] count failed: ${error.message}`);
  return count ?? 0;
}
