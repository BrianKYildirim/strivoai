/**
 * Flow 8 — Onboarding, end to end, on a genuinely un-onboarded production account.
 *
 * The free account under test has never completed onboarding, so this drives the
 * real 4-step flow and the first analysis it triggers. That first analysis is
 * also the strictest form of "Resume Analysis from one click": the user performs
 * a single Finish Setup click and must end up on a rendered result.
 *
 * COST: spends REAL merits for one resume analysis. Runs once.
 *
 * If the account has already been onboarded by a previous run, the test SKIPS
 * rather than failing — onboarding is a once-per-account flow and is not
 * repeatable without a fresh account.
 */
import path from 'node:path';
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { freeAccount } from './helpers/env';
import { signIn, settledMeritBalance } from './helpers/app';
import { safeLog } from './helpers/redact';

const RESUME = path.resolve('e2e/fixtures/test-resume.pdf');
const TARGET_ROLE = 'Software Engineering';
const TARGET_INDUSTRY = 'Technology';
const GOAL = 'Senior Software Engineering role at a product company — 2027';

test.beforeEach(() => requireCredentials());

test('onboarding completes and the first analysis renders from one click', async ({
  page,
  observed,
}) => {
  test.setTimeout(300_000);

  await signIn(page, freeAccount());

  const onOnboarding = /\/onboarding/.test(page.url());
  test.skip(
    !onOnboarding,
    'Free account is already onboarded — onboarding is a once-per-account flow.',
  );

  const before = await settledMeritBalance(page);

  // Step 1 — resume upload.
  // The filename must appear before Continue: setInputFiles returns before the
  // client-side validation/attach completes, and advancing early leaves
  // onboarding with no resume (proven by e2e/onboarding-flow.spec.ts, which
  // waits here for exactly this reason).
  await expect(page.getByText('Step 1 of 4')).toBeVisible({ timeout: 30_000 });
  await page.locator('input[type="file"]').first().setInputFiles(RESUME);
  await expect(
    page.getByText('test-resume.pdf'),
    'resume never attached in onboarding step 1',
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 2 — optional LinkedIn, skipped
  await expect(page.getByText('Step 2 of 4')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip for now' }).click();

  // Step 3 — targets
  await expect(page.getByText('Step 3 of 4')).toBeVisible({ timeout: 30_000 });
  await page.getByText(TARGET_ROLE, { exact: true }).click();
  await page.getByText(TARGET_INDUSTRY, { exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 4 — goal, then the single click that triggers the first analysis
  await expect(page.getByText('Step 4 of 4')).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Set Your Professional Goal').fill(GOAL);

  const submissions: string[] = [];
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    if (/\/functions\/v1\/(analyze-resume|submit-resume-analysis-job)/.test(req.url())) {
      submissions.push('submit');
    }
  });

  await page.getByRole('button', { name: /Finish Setup/ }).click();

  // ONE CLICK → a rendered result.
  await expect(page).toHaveURL(/\/results\//, { timeout: 240_000 });
  await expectNoRawErrors(page, '/results after onboarding analysis');

  expect(
    submissions.length,
    `onboarding fired ${submissions.length} analysis submissions (expected 1)`,
  ).toBe(1);

  // The result must actually contain a score, not an empty shell.
  await expect(page.getByText('/100').first()).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText(/Analysis Taking Longer Than Expected/i),
    'analysis stalled into the slow-path message',
  ).toHaveCount(0);

  // Dashboard must now be reachable — onboarding must not loop.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });

  const after = await settledMeritBalance(page);
  const spent = (before ?? 0) - (after ?? 0);
  safeLog(`[prod-smoke] merits spent during onboarding analysis: ${spent}`);
  test.info().annotations.push({ type: 'merits-spent', description: String(spent) });

  expect(observed.pageErrors, 'uncaught page errors during onboarding').toEqual([]);
});
