/**
 * Flow 2 — Resume analysis end-to-end (TEST-04, D-02/D-04).
 *
 * Drives the REAL upload → analyze → render path against the Supabase TEST
 * project: pick a resume, run analysis, and assert the Results page renders a
 * SHAPED analysis (a numeric score out of 100 + the report sections).
 *
 * AI is stubbed SERVER-SIDE via the existing AI_TEST_MODE seam on the TEST
 * project's edge functions — this spec contains NO Anthropic mock and does NOT
 * reference AI_TEST_MODE (it is reused, not rebuilt). The stub varies the score
 * deterministically per input hash, so we assert on presence/shape (a score
 * value, the report heading, the screening sections), NEVER exact AI wording.
 *
 * ── WHY THIS SPEC SUBMITS A GENERATED PDF, NOT THE COMMITTED FIXTURE (09-09, D9-03) ──────
 * This spec PASSED VACUOUSLY for a month, and the way it did is worth stating plainly.
 *
 * `src/pages/Upload.tsx` de-duplicates on `file_hash`: if the user has already analyzed a
 * document with the same content hash, Upload SKIPS the analysis entirely and navigates
 * straight to the existing result. That is CORRECT product behaviour (reused input → reuse
 * the prior analysis, no second charge — scenario S-08). But it means the STATIC
 * `fixtures/test-resume.pdf` can only ever trigger a real analysis ONCE per user, for all
 * time — and the seeded E2E user analyzed it on 2026-06-11. Every run since then took the
 * dedup path: the spec completed in ~3.2s (a real AI_TEST_MODE analysis takes ~19s), created
 * ZERO rows, and asserted its heading against the June 11 analysis. It was green, it was in
 * the blocking gate, and the flow it is named for had not executed in a month.
 *
 * Two changes make that failure mode structurally unavailable:
 *   1. Each run submits a per-run UNIQUE synthetic document (`fixtures/make-unique-resume.ts`),
 *      so the content hash has never been seen and the dedup path cannot be reached.
 *   2. The spec asserts a durable DB DELTA — exactly ONE new completed `resumes` row. A test
 *      that only asserts on rendered pixels cannot tell "I ran an analysis" from "I was shown
 *      someone's month-old analysis". The delta assertion can: a dedup short-circuit lands
 *      ZERO new rows and turns this RED.
 *
 * D-15: the persona is SYNTHETIC ("Jordan E2E Baseline", jordan.baseline@example.com — an
 * RFC-2606 reserved domain). No real user data, ever.
 *
 * SECURITY: the service-role key is read in the NODE process only (the `e2e/global-setup.ts`
 * precedent) and is NEVER passed to page.evaluate / addInitScript / any browser-visible
 * surface. The browser context holds only the anon-key session from storageState.
 */
import { test, expect } from '@playwright/test';
import { E2E_TEST_EMAIL } from './global-setup';
import { makeUniqueResumePdf } from './fixtures/make-unique-resume';
import { mockValidDocumentResponse } from './helpers/mock-document-validator';
import {
  adminClient,
  analyzedResumeCountForFile,
  diagnoseLiveAnthropic,
  requireTestUserId,
} from './helpers/test-user';

test.use({ storageState: '.auth/user.json' });

test('upload → analyze (AI stubbed) → results render a shaped analysis', async ({ page }) => {
  // A real analysis takes ~19s under AI_TEST_MODE (the dedup path took ~3s — that gap IS the
  // bug this spec used to have). The merit balance + rate-limit counter are reset once per run
  // by e2e/global-setup.ts (D9-04), so the submit is always affordable and never 429'd.
  test.setTimeout(180_000);
  await mockValidDocumentResponse(page);

  const admin = adminClient();
  const userId = await requireTestUserId(admin, E2E_TEST_EMAIL);

  // A never-before-seen content hash — this is what forces a REAL analysis instead of Upload's
  // file_hash dedup short-circuit. The file NAME is unique per run too, which is what lets the
  // durable assertion below scope itself to THIS document (the seeded E2E user is shared, and
  // specs run in parallel workers — a user-wide count would see other specs' analyses).
  const { filePath, fileName } = makeUniqueResumePdf();

  // Fail-loud precondition window (D9-09): if the heading never appears, we inspect the analysis
  // runs created after this instant to tell "AI_TEST_MODE is off, live Anthropic call timed out"
  // apart from a genuine code regression. Captured BEFORE the submit so the diagnosis query is
  // scoped to this run's own analysis.
  const windowStart = new Date().toISOString();

  await page.goto('/upload');

  // The file input is hidden (label-triggered); setInputFiles works on hidden
  // inputs and fires the change handler that stages the file for analysis.
  await page.locator('#file-input').setInputFiles(filePath);

  // Once a file is staged, the filename + the "Analyze Resume" CTA render.
  await expect(page.getByText(fileName)).toBeVisible();

  await page.getByRole('button', { name: 'Analyze Resume', exact: true }).click();

  // Analysis runs (client extraction → real edge fn → stubbed AI → real
  // persistence) and routes to the streaming Results page.
  await expect(page).toHaveURL(/\/results\//, { timeout: 60_000 });

  // The completed Results page renders the screening report — a stable header
  // that only appears once grading_data is present.
  try {
    await expect(
      page.getByRole('heading', { name: /resume screening report/i }),
    ).toBeVisible({ timeout: 90_000 });
  } catch (err) {
    // Before blaming the code: a 90s heading-timeout on the TEST project is the exact symptom of
    // AI_TEST_MODE being off (a live Anthropic call that timed out), not a render regression.
    const diagnosis = await diagnoseLiveAnthropic(admin, userId, windowStart);
    if (diagnosis) throw new Error(diagnosis, { cause: err });
    throw err;
  }

  // Shaped score: the hero shows {overall_score} immediately followed by "/100".
  await expect(page.getByText('/100').first()).toBeVisible({ timeout: 90_000 });

  // A numeric score is rendered (60–99 per the AI_TEST_MODE deterministic
  // clamp). Assert shape/range, not an exact value.
  const scoreText = await page
    .locator('span', { hasText: /^\d{2,3}$/ })
    .first()
    .innerText();
  const score = Number(scoreText.trim());
  expect(Number.isFinite(score)).toBe(true);
  expect(score).toBeGreaterThanOrEqual(1);
  expect(score).toBeLessThanOrEqual(100);

  // Sections of the report are present (the analysis is structurally complete,
  // not just a bare score). The "Analysis Complete" badge + the screening
  // report container confirm the shaped render.
  await expect(page.getByText(/analysis complete/i)).toBeVisible({ timeout: 30_000 });

  // ── THE ANTI-VACUITY ASSERTION (D9-03) ────────────────────────────────────────────────
  // Everything above this line renders identically whether the analysis actually RAN or the
  // page merely displayed a previously-stored one. This is the assertion that tells them
  // apart: THE DOCUMENT THIS RUN SUBMITTED must end up with exactly one completed analysis.
  // Upload's dedup short-circuit lands ZERO rows for it, so a spec that ever slides back onto
  // that path turns RED here instead of passing in 3 seconds while proving nothing.
  //
  // Scoped to this run's unique file_name (not a user-wide count) so it is immune to the other
  // analysis-driving specs that share this seeded user in parallel workers.
  //
  // Poll for convergence first: the Results page renders from the SSE stream, so the durable
  // `resumes.grading_data` write settles a moment after the heading appears.
  await expect
    .poll(async () => analyzedResumeCountForFile(admin, userId, fileName), {
      timeout: 60_000,
      intervals: [1_000],
      message:
        'the upload must durably persist exactly one completed analysis for THIS document — ' +
        'zero means this spec took Upload\'s file_hash dedup path and asserted against a ' +
        'pre-existing analysis',
    })
    .toBe(1);
});
