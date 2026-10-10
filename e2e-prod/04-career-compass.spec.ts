/**
 * Flow 4 — Career Compass, with the INPUT_MISSING repro built in.
 *
 * Production forensics (2026-07-27) found 9 career_compass failures coded
 * INPUT_MISSING between 2026-07-23 and 07-25, all on one synthetic account,
 * where the job payload DID contain both resumeFilePath and linkedinPdfContent.
 * Hypothesis: the stored resumeFilePath points at a storage object that no
 * longer exists, so the STORED-resume path fails while a FRESH upload succeeds.
 *
 * This spec runs the stored-resume path deliberately and reports which variant
 * fails, so the hypothesis is confirmed or killed on real infrastructure.
 */
import path from 'node:path';
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { eliteAccount } from './helpers/env';
import { signIn, settledMeritBalance, rapidClick, expectExactlyOneSubmission } from './helpers/app';
import { safeLog } from './helpers/redact';

const RESUME = path.resolve('e2e/fixtures/test-resume.pdf');

test.beforeEach(() => requireCredentials());

test('Career Compass: fresh-upload path completes from one click', async ({ page, observed }) => {
  test.setTimeout(300_000);

  await signIn(page, eliteAccount());
  const before = await settledMeritBalance(page);

  await page.goto('/career-compass');
  await expectNoRawErrors(page, '/career-compass on load');

  const submissions: string[] = [];
  page.on('request', (req) => {
    if (
      req.method() === 'POST' &&
      /\/functions\/v1\/(analyze-career|submit-career-analysis-job)/.test(req.url())
    ) {
      submissions.push('career');
    }
  });

  // Two distinct entry points, depending on account state:
  //   - saved analysis  → RESULT view; "Start New Analysis" calls
  //     handleRefreshAnalysis, which RE-RUNS immediately (it does NOT reopen the
  //     intake form — CareerCompass.tsx:1206).
  //   - no saved analysis → intake form; upload then "Discover My Career Path".
  // Either way the trigger is ONE click, which is what we are measuring.
  // Wait for the page to settle into ONE of the two views before branching —
  // checking too early races React's fetch of the saved analysis.
  await expect(
    page.getByRole('button', { name: /Start New Analysis|Discover My Career Path/i }).first(),
    'neither Career Compass view rendered',
  ).toBeVisible({ timeout: 60_000 });

  // On the RESULT view, "Start New Analysis" only clears state to reveal the
  // intake form (CareerCompass.tsx:909 setAnalysis(null)) — it does NOT re-run.
  // So it is a navigation step, never the analysis trigger.
  const startNew = page.getByRole('button', { name: /Start New Analysis/i }).first();
  if (await startNew.count()) {
    await startNew.click();
  }

  // Intake form: the CTA is disabled until a resume is present (either freshly
  // uploaded or the account's savedResumeFilePath).
  const cta = page.getByRole('button', { name: /Discover My Career Path/i }).first();
  await expect(cta, 'intake form never rendered after Start New Analysis').toBeVisible({
    timeout: 60_000,
  });

  if (!(await cta.isEnabled().catch(() => false))) {
    const fileInput = page.locator('#resume');
    await expect(fileInput, 'no resume input to satisfy the CTA').toHaveCount(1, {
      timeout: 15_000,
    });
    await fileInput.setInputFiles(RESUME);
  }
  await expect(cta, 'Career Compass CTA never enabled').toBeEnabled({ timeout: 60_000 });

  const landed = await rapidClick(page, /Discover My Career Path/i, 3);
  safeLog(`[prod-smoke] career compass clicks landed: ${landed}`);

  await expectExactlyOneSubmission(page, submissions, 'career compass');

  await page.waitForTimeout(20_000);
  await expectNoRawErrors(page, '/career-compass after analysis');

  const after = await settledMeritBalance(page);
  const spent = before! - (after ?? before!);
  safeLog(`[prod-smoke] merits spent on Career Compass (fresh upload): ${spent}`);
  test.info().annotations.push({ type: 'merits-spent', description: String(spent) });

  expect(observed.pageErrors, 'uncaught page errors during Career Compass').toEqual([]);
});

test('Career Compass: STORED-resume path (INPUT_MISSING repro)', async ({ page }) => {
  test.setTimeout(300_000);

  await signIn(page, eliteAccount());
  const before = await settledMeritBalance(page);

  await page.goto('/career-compass');
  const startNew = page.getByRole('button', { name: /Start New Analysis/i }).first();
  if (await startNew.count()) {
    await startNew.click();
  }
  // Deliberately do NOT upload — exercise the saved resumeFilePath branch.
  const cta = page.getByRole('button', { name: /Discover My Career Path/i }).first();

  const enabled = await cta.isEnabled().catch(() => false);
  test.skip(!enabled, 'No stored resume on this account — stored-resume path not reachable.');

  await cta.click();
  await page.waitForTimeout(25_000);

  const after = await settledMeritBalance(page);
  const spent = before! - (after ?? before!);

  // The decisive assertion: if this path fails, the failure must be surfaced in
  // plain language AND the merits must come back.
  const rawErrors = await page.locator('body').innerText().catch(() => '');
  const looksFailed = /fail|error|something went wrong|try again/i.test(rawErrors);

  safeLog(
    `[prod-smoke] stored-resume Career Compass — failed:${looksFailed} meritsNetSpent:${spent}`,
  );
  test.info().annotations.push({
    type: 'stored-resume-outcome',
    description: `failed=${looksFailed} netSpent=${spent}`,
  });

  await expectNoRawErrors(page, '/career-compass stored-resume path');

  if (looksFailed) {
    // A permanent failure MUST refund. Net spend has to settle back to zero.
    expect(spent, 'stored-resume Career Compass failed but merits were NOT refunded').toBe(0);
  }
});
