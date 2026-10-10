/**
 * Free-user ONBOARDING flow — end-to-end on the Supabase TEST (Preview) project.
 *
 * This is the flow the pre-seeded baseline user (e2e/global-setup.ts) can NEVER
 * exercise: that user is seeded "already onboarded" (resume + goal) so it lands on
 * /dashboard. To test onboarding itself we mint a FRESH, UNSEEDED free user per run,
 * log in through the real /auth form, and drive all 4 onboarding steps against the
 * real edge functions (AI stubbed server-side via the TEST project's AI_TEST_MODE seam
 * — this spec contains no Anthropic mock and does not reference it).
 *
 * The critical contract under test (the thing users pay for): after Step 4, the
 * AUTOMATIC resume analysis must complete on the FIRST attempt — the user must reach a
 * rendered Results page, must NOT see "Analysis Taking Longer Than Expected" or a server
 * error, must be able to reach the dashboard, and exactly ONE analysis must be persisted
 * (no duplicate row / no double run).
 *
 * SECURITY: the service-role key is read in the NODE process only (the global-setup
 * precedent) and is NEVER exposed to the browser. The browser drives the public /auth
 * form with the fresh user's password and holds only an anon-key session.
 *
 * D-15 persona hygiene: synthetic user on the RFC-2606 reserved `strivo.test` domain,
 * synthetic resume content ("Jordan E2E Baseline"). No real-person data. The user is
 * deleted in afterAll to keep the shared Preview project clean.
 */
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeUniqueResumePdf } from './fixtures/make-unique-resume';
import { mockValidDocumentResponse } from './helpers/mock-document-validator';
import { adminClient, resetAnalyzeResumeRateLimit, seedMerits } from './helpers/test-user';

// This spec logs in as its OWN fresh user, so it must start from a CLEAN browser
// context — override the chromium project's baseline storageState.
test.use({ storageState: { cookies: [], origins: [] } });

const TARGET_ROLE = 'Software Engineering'; // unique to ROLE_OPTIONS
const TARGET_INDUSTRY = 'Technology'; // unique to INTEREST_OPTIONS
const GOAL = 'Senior Software Engineering role at a product company — 2027';

let admin: SupabaseClient;
let userId: string;
let email: string;
let password: string;

test.beforeAll(async () => {
  admin = adminClient();
  const runToken = randomUUID();
  email = `e2e+onboard-${runToken}@strivo.test`;
  // Reuse the operator's E2E password so the login form behaves identically to auth.setup.
  password = process.env.E2E_TEST_PASSWORD as string;
  expect(password, 'E2E_TEST_PASSWORD must be set (.env.test.local / CI secret)').toBeTruthy();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user?.id) {
    throw new Error(`[onboarding-flow] could not create fresh user: ${error?.message ?? 'no id'}`);
  }
  userId = data.user.id;

  // The handle_new_user trigger auto-creates a free-tier profiles row. We seed NOTHING
  // else — no resume, no career_targets — so ProtectedRoute routes this user to onboarding.
  // Give a fresh merit balance + clean rate-limit window so the free-tier analysis is
  // affordable and un-throttled (test-environment seeding only; real limits untouched).
  await seedMerits(admin, userId).catch(() => undefined);
  await resetAnalyzeResumeRateLimit(admin, userId).catch(() => undefined);
});

test.afterAll(async () => {
  if (admin && userId) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
  }
});

test('fresh free user completes 4-step onboarding → analysis succeeds first try → dashboard reachable', async ({
  page,
}) => {
  // AI_TEST_MODE analysis lands in ~2–30s on Preview; give generous headroom but well under
  // the product's 120s "taking longer" timeout so a real hang fails RED here.
  test.setTimeout(180_000);
  await mockValidDocumentResponse(page);

  const { filePath, fileName } = makeUniqueResumePdf();

  // ── Log in as the fresh, unseeded user ───────────────────────────────────────────────
  await page.goto('/auth');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });

  // A user with no resume/goal is routed to onboarding. Go there explicitly (the route
  // carries skipOnboardingCheck) so the spec is deterministic regardless of the post-login landing.
  await page.goto('/onboarding');
  await expect(page.getByText('Step 1 of 4')).toBeVisible({ timeout: 30_000 });

  // ── Step 1: resume (required) ────────────────────────────────────────────────────────
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
  await expect(page.getByText(fileName)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  // ── Step 2: LinkedIn (optional) — SKIP, per the "LinkedIn must remain optional" requirement ─
  await expect(page.getByText('Step 2 of 4')).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  // ── Step 3: target roles & industries ────────────────────────────────────────────────
  await expect(page.getByText('Step 3 of 4')).toBeVisible();
  await page.getByText(TARGET_ROLE, { exact: true }).click();
  await page.getByText(TARGET_INDUSTRY, { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // ── Step 4: professional goal (required) → finish ────────────────────────────────────
  await expect(page.getByText('Step 4 of 4')).toBeVisible();
  await page.getByLabel('Set Your Professional Goal').fill(GOAL);
  await page.getByRole('button', { name: /Finish Setup/ }).click();

  // ── The automatic analysis must land the user on a RENDERED Results page ─────────────
  await expect(page).toHaveURL(/\/results\//, { timeout: 30_000 });
  const resumeId = page.url().split('/results/')[1]?.split(/[?#]/)[0];
  expect(resumeId, 'results URL must carry a resume id').toBeTruthy();

  // The completed report heading only renders once grading_data is present — this is the
  // "analysis completed on first attempt" assertion.
  await expect(
    page.getByRole('heading', { name: /resume screening report/i }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('/100').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/analysis complete/i)).toBeVisible({ timeout: 10_000 });

  // The user must NOT have been shown the timeout dead-end at any point on the way here.
  await expect(page.getByText(/Analysis Taking Longer Than Expected/i)).toHaveCount(0);

  // ── Persistence + no-duplicate: exactly ONE completed analysis for this user ──────────
  const completedCount = await analyzedCount(admin, userId);
  expect(completedCount, 'exactly one completed analysis must persist (no duplicate run)').toBe(1);

  const { data: resumeRows } = await admin
    .from('resumes')
    .select('id, grading_data, overall_score, analyzed_at')
    .eq('user_id', userId);
  expect(resumeRows?.length, 'exactly one resume row for the user').toBe(1);
  expect(resumeRows?.[0]?.id).toBe(resumeId);
  expect(resumeRows?.[0]?.grading_data, 'grading_data must be persisted').toBeTruthy();
  expect(typeof resumeRows?.[0]?.overall_score).toBe('number');

  // ── Onboarding data persistence: career_targets carries roles, industries, and goal ──
  const { data: targets } = await admin
    .from('career_targets')
    .select('target_roles, target_industries, professional_goal')
    .eq('user_id', userId)
    .maybeSingle();
  expect(targets?.target_roles, 'target roles persisted').toContain(TARGET_ROLE);
  expect(targets?.target_industries, 'target industries persisted').toContain(TARGET_INDUSTRY);
  expect(targets?.professional_goal?.trim(), 'professional goal persisted').toBe(GOAL);

  // Tier stays free (no accidental upgrade during onboarding).
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .maybeSingle();
  expect(profile?.subscription_tier).toBe('free');

  // ── The user can reach the dashboard (not trapped on Results) ────────────────────────
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

/** Count of COMPLETED analyses (grading_data present) for a user. */
async function analyzedCount(client: SupabaseClient, uid: string): Promise<number> {
  const { count, error } = await client
    .from('resumes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid)
    .not('grading_data', 'is', null);
  if (error) throw new Error(`[onboarding-flow] count failed: ${error.message}`);
  return count ?? 0;
}
