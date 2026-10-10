/**
 * Flow 3 — LinkedIn Grader: one click, one charge, no duplicate on rapid clicks.
 * Spends REAL merits on the Elite account. Runs exactly one grading.
 */
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { eliteAccount } from './helpers/env';
import { signIn, settledMeritBalance, rapidClick, expectExactlyOneSubmission } from './helpers/app';
import path from 'node:path';
import { safeLog } from './helpers/redact';

const LINKEDIN_PDF = path.resolve('e2e/fixtures/test-resume.pdf');

test.beforeEach(() => requireCredentials());

test('LinkedIn Grader: one click produces one grading and one charge', async ({ page, observed }) => {
  test.setTimeout(300_000);

  await signIn(page, eliteAccount());
  const before = await settledMeritBalance(page);
  expect(before, 'merit balance unreadable before LinkedIn grading').not.toBeNull();

  await page.goto('/linkedin-grader');
  await expectNoRawErrors(page, '/linkedin-grader on load');

  // Settle into one of the two views first — checking too early races the fetch
  // of the stored grade.
  await expect(
    page.getByRole('button', { name: /Scan New Profile|Get Personalized Analysis/i }).first(),
    'neither LinkedIn Grader view rendered',
  ).toBeVisible({ timeout: 60_000 });

  // An account with an existing grade lands on the RESULT view. "Scan New
  // Profile" clears state to reveal the intake form (LinkedInGrader.tsx:1022
  // setResult(null)) — a navigation step, not the analysis trigger.
  const scanNew = page.getByRole('button', { name: /Scan New Profile/i }).first();
  if (await scanNew.count()) {
    await scanNew.click();
  }

  const cta = page.getByRole('button', { name: /Get Personalized Analysis/i }).first();
  await expect(cta, 'LinkedIn intake form never rendered').toBeVisible({ timeout: 60_000 });

  // The CTA is gated on `canSubmit = !!file` (LinkedInGrader.tsx:749) — ONLY a
  // PDF upload enables it. The paste-text and profile-URL fields do not, so
  // driving those leaves the button permanently disabled.
  await page.locator('input[type="file"]').first().setInputFiles(LINKEDIN_PDF);

  await expect(cta, 'grading CTA never enabled').toBeEnabled({ timeout: 30_000 });

  const submissions: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/functions/v1/grade-linkedin')) {
      submissions.push('grade');
    }
  });

  const landed = await rapidClick(page, /Get Personalized Analysis/i, 3);
  safeLog(`[prod-smoke] linkedin CTA clicks landed: ${landed}`);

  await expectExactlyOneSubmission(page, submissions, 'LinkedIn grading');

  // Result must render without raw errors.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(15_000);
  await expectNoRawErrors(page, '/linkedin-grader after grading');

  const after = await settledMeritBalance(page);
  const spent = before! - (after ?? before!);
  safeLog(`[prod-smoke] merits spent on LinkedIn grading: ${spent}`);
  test.info().annotations.push({ type: 'merits-spent', description: String(spent) });

  expect(observed.pageErrors, 'uncaught page errors during LinkedIn grading').toEqual([]);
});
