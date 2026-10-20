/**
 * Flow 2 — Resume Analysis from ONE click, duplicate-click guard, refresh recovery.
 *
 * COST NOTE: this spec drives a REAL analysis on a REAL account and therefore
 * spends REAL merits. That is intentional — it is the only way to prove the
 * one-job/one-charge invariant end to end. It runs exactly ONE analysis.
 */
import path from 'node:path';
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { freeAccount } from './helpers/env';
import { signIn, settledMeritBalance, rapidClick, expectExactlyOneSubmission } from './helpers/app';
import { safeLog } from './helpers/redact';

const RESUME = path.resolve('e2e/fixtures/test-resume.pdf');

test.beforeEach(() => requireCredentials());

test('resume analysis: one click, one job, one charge — and duplicate clicks do not duplicate', async ({
  page,
  observed,
}) => {
  test.setTimeout(300_000);

  await signIn(page, freeAccount());
  const before = await settledMeritBalance(page);
  expect(before, 'merit balance must be readable before the analysis').not.toBeNull();

  await page.goto('/upload');
  await page.setInputFiles('#file-input', RESUME);

  const analyze = page.getByRole('button', { name: /Analyze Resume/i }).first();
  await expect(analyze, 'Analyze button never became enabled after upload').toBeEnabled({
    timeout: 60_000,
  });

  // Count every submission the app makes while we hammer the button.
  const submissions: string[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    const u = req.url();
    if (u.includes('/functions/v1/analyze-resume') || u.includes('/functions/v1/submit-resume-analysis-job')) {
      submissions.push(u.includes('submit-') ? 'queue' : 'stream');
    }
  });

  // DUPLICATE-CLICK PROBE: three rapid clicks. A correct guard disables the
  // button after the first, so at most one submission should leave the browser.
  const landed = await rapidClick(page, /Analyze Resume/i, 3);
  safeLog(`[prod-smoke] analyze clicks landed: ${landed}`);

  await expectExactlyOneSubmission(page, submissions, 'resume analysis');

  // The analysis must complete and land on a result.
  await expect(page).toHaveURL(/\/results\//, { timeout: 240_000 });
  await expectNoRawErrors(page, '/results after analysis');

  const resultUrl = page.url();

  // REFRESH RECOVERY: a hard reload must re-render the stored result and must
  // NOT re-trigger work.
  submissions.length = 0;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(page).toHaveURL(resultUrl);
  await expectNoRawErrors(page, '/results after refresh');
  expect(submissions.length, 'refresh re-triggered an analysis').toBe(0);

  // NAVIGATION RECOVERY: away and back.
  await page.goto('/dashboard');
  await page.goto(resultUrl);
  await page.waitForLoadState('networkidle').catch(() => {});
  await expectNoRawErrors(page, '/results after navigation');
  expect(submissions.length, 'navigation re-triggered an analysis').toBe(0);

  // MERIT ACCOUNTING: exactly one charge. Balance must drop, and by a single
  // feature cost — never by a multiple of it.
  await page.goto('/dashboard');
  const after = await settledMeritBalance(page);
  expect(after, 'merit balance must be readable after the analysis').not.toBeNull();

  const spent = before! - after!;
  safeLog(`[prod-smoke] merits spent on one resume analysis: ${spent}`);
  expect(spent, 'analysis did not deduct any merits').toBeGreaterThan(0);
  // Recorded for the report; the exact cost is asserted against the DB by the
  // read-only verification pass, which can see the transaction rows directly.
  test.info().annotations.push({ type: 'merits-spent', description: String(spent) });

  expect(observed.pageErrors, 'uncaught page errors during analysis').toEqual([]);
});
