/**
 * Quick task 260804-l87 — STAGING verification of the Career Compass INPUT_MISSING fix.
 *
 * WHAT THIS REPRODUCES
 * --------------------
 * The 2026-08-04 production failure: a brand-new Free account completed onboarding, then
 * Career Compass returned "Analysis hit a server error — your Merits were refunded"
 * (job 67b8e64f…: failure_code=INPUT_MISSING, failure_stage=generating, refunded=true).
 *
 * The precondition was a `resumes` row whose `extracted_text` was never persisted, combined
 * with a saved-resume submit (no new upload). Backend raw-byte PDF parsing is an intentional
 * no-op (supabase/functions/_shared/pdf-parser.ts), so with `extracted_text` NULL and no
 * client-supplied text there is NO source and analyze-career:1876 fails closed with 400.
 *
 * WHY THE PRECONDITION IS SEEDED RATHER THAN WAITED FOR
 * -----------------------------------------------------
 * Staging/preview HAS `STRIVO_RUNTIME_ENV` set, so `begin-feature-run` mints tokens, `ocr-pdf`
 * accepts the persistence call, and `resumes.extracted_text` is populated normally — preview
 * rows created today all carry `phase51-v1`. Staging therefore CANNOT reproduce the production
 * outage on its own. Seeding a NULL-text row is the only faithful way to drive the exact failing
 * state on this environment. This is test-environment seeding on the TEST project, in the
 * established `e2e/helpers/test-user.ts` idiom — no product code is altered.
 *
 * RUN
 *   npx playwright test --config=playwright.phase-01.1-live-preview.config.ts \
 *     e2e/phase-01.1-live-preview/career-compass-saved-resume.live.ts
 *
 * SCOPE NOTE: preview short-circuits Anthropic with fixture content, so this proves the
 * INPUT_MISSING mechanism, the heal, and the merit ledger — NOT the quality of AI prose.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { E2E_TEST_EMAIL } from '../global-setup';
import {
  adminClient,
  meritDebitKeyMultiplicity,
  requireTestUserId,
  seedMerits,
} from '../helpers/test-user';

const RESUME_PDF = readFileSync(resolve('e2e/fixtures/test-resume.pdf'));

/**
 * Seed the EXACT production precondition: a stored resume file whose row has no extracted text.
 * Returns the new resume id + storage path.
 */
async function seedResumeWithoutText(
  admin: SupabaseClient,
  userId: string,
): Promise<{ id: string; filePath: string }> {
  const filePath = `${userId}/${Date.now()}_l87-saved-resume.pdf`;
  const { error: uploadError } = await admin.storage
    .from('resumes')
    .upload(filePath, RESUME_PDF, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw new Error(`[l87] storage upload failed: ${uploadError.message}`);

  const { data, error } = await admin
    .from('resumes')
    .insert({
      user_id: userId,
      file_name: 'l87-saved-resume.pdf',
      file_size: RESUME_PDF.byteLength,
      file_path: filePath,
      file_url: filePath,
      // THE PRECONDITION — exactly what production had.
      extracted_text: null,
      text_hash: null,
      extraction_version: null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`[l87] resumes insert failed: ${error.message}`);
  return { id: data.id as string, filePath };
}

async function readResumeText(
  admin: SupabaseClient,
  resumeId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('resumes')
    .select('extracted_text')
    .eq('id', resumeId)
    .single();
  if (error) throw new Error(`[l87] resumes read failed: ${error.message}`);
  return (data.extracted_text as string | null) ?? null;
}

async function latestCareerJob(admin: SupabaseClient, userId: string, sinceIso: string) {
  const { data, error } = await admin
    .from('analysis_jobs')
    .select('id,status,state,failure_code,failure_stage,refunded,merit_settled,tier,payload')
    .eq('user_id', userId)
    .eq('job_type', 'career_compass_analysis')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`[l87] analysis_jobs read failed: ${error.message}`);
  return data as null | {
    id: string; status: string; state: string; failure_code: string | null;
    failure_stage: string | null; refunded: boolean; merit_settled: boolean;
    tier: string | null; payload: Record<string, unknown>;
  };
}

/** Drive the saved-resume Career Compass submit and wait for a terminal outcome. */
async function runCareerCompass(page: Page): Promise<void> {
  await page.goto('/career-compass');

  // The shared E2E user usually has a cached career_compass result, so the page opens on the
  // restored-results view ("Showing your saved Career Compass results") rather than the input
  // form. Reset through the real control instead of deleting rows — analysis_results is
  // deliberately read-only (migration 20260420000000_mig_02_analysis_results_readonly).
  //
  // NOTE: `locator.isVisible()` does NOT auto-wait, so it cannot be used to decide which of the
  // two states we are in — it answers `false` while the page is still hydrating and the reset
  // click gets skipped. Settle on a state first, then act.
  const startNew = page.getByRole('button', { name: /Start New Analysis/i });
  const savedResume = page.getByText(/Using saved resume/i);
  await expect
    .poll(async () => {
      if (await startNew.count()) return 'cached';
      if (await savedResume.count()) return 'form';
      return 'loading';
    }, { timeout: 90_000, intervals: [1_000] })
    .not.toBe('loading');

  if (await startNew.count()) await startNew.first().click();

  // The saved-resume branch is the one under test — assert we are actually on it.
  await expect(savedResume).toBeVisible({ timeout: 30_000 });

  const cta = page.getByRole('button', { name: /Discover My Career Path/i });
  await expect(cta).toBeEnabled({ timeout: 15_000 });
  await cta.click();
}

for (const tier of ['free', 'elite'] as const) {
  test(`Career Compass completes on a saved resume with no persisted text — ${tier}`, async ({ page }) => {
    test.setTimeout(300_000);
    const admin = adminClient();
    const userId = await requireTestUserId(admin, E2E_TEST_EMAIL);

    const { data: profile, error: profileError } = await admin
      .from('profiles').select('subscription_tier').eq('id', userId).single();
    if (profileError) throw new Error(`[l87] profile read failed: ${profileError.message}`);
    const priorTier = profile.subscription_tier as string;

    await admin.from('profiles').update({ subscription_tier: tier }).eq('id', userId);
    await seedMerits(admin, userId, 60);
    await admin.from('rate_limit_counters').delete().eq('rate_key', `user:${userId}:analyze-career`);

    const sinceIso = new Date(Date.now() - 5_000).toISOString();
    const { id: resumeId } = await seedResumeWithoutText(admin, userId);

    // Precondition is real.
    expect(await readResumeText(admin, resumeId), 'seeded row must start with NO text').toBeNull();

    try {
      await runCareerCompass(page);

      // ── Terminal outcome, read from the AUTHORITATIVE job row ─────────────────────
      // The UI heading is not a safe signal on its own: the same "Your Career Compass"
      // heading renders the RESTORED cached result, so polling it could pass on stale
      // content. The job row created after `sinceIso` can only come from this submit.
      await expect
        .poll(async () => (await latestCareerJob(admin, userId, sinceIso))?.status ?? 'none',
          { timeout: 240_000, intervals: [3_000] })
        .toMatch(/^(completed|failed)$/);

      const job = await latestCareerJob(admin, userId, sinceIso);
      expect(job, 'a career_compass job row must exist').not.toBeNull();
      // The production failure, stated precisely.
      expect(job!.failure_code, 'must not reproduce the production failure').not.toBe('INPUT_MISSING');
      expect(job!.status, `job failed: ${job!.failure_code} @ ${job!.failure_stage}`).toBe('completed');
      expect(job!.refunded, 'a successful run must not refund').toBe(false);

      // And the user actually sees a result, not the refund error.
      await expect(page.getByRole('heading', { name: /Your Career Compass/i }))
        .toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(/hiccup|Merits were refunded/i)).toHaveCount(0);

      // The submitted payload carries the resume text the old build dropped.
      expect(
        typeof job!.payload.resumeTextContent === 'string' &&
          (job!.payload.resumeTextContent as string).length > 100,
        'submit payload must carry resumeTextContent on the saved-resume path',
      ).toBe(true);

      // ── The row was HEALED in place — no re-upload required ───────────────────────
      const healed = await readResumeText(admin, resumeId);
      expect(healed && healed.trim().length > 100, 'extracted_text must be persisted').toBe(true);

      // ── Merit charged EXACTLY once for this run ───────────────────────────────────
      const multiplicity = await meritDebitKeyMultiplicity(admin, userId, sinceIso);
      for (const [key, count] of multiplicity) {
        expect(count, `merit idempotency key ${key} must carry exactly one debit`).toBe(1);
      }
    } finally {
      await admin.from('profiles').update({ subscription_tier: priorTier }).eq('id', userId);
      await admin.from('resumes').delete().eq('id', resumeId);
    }
  });
}
