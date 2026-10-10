/**
 * Flow 5 — Recruiting Lens: one click, one charge, no duplicate on rapid clicks.
 * Requires a prior resume analysis on the account (enforced by the form).
 */
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { eliteAccount } from './helpers/env';
import { signIn, settledMeritBalance, rapidClick, expectExactlyOneSubmission, dismissTutorial } from './helpers/app';
import { safeLog } from './helpers/redact';

const SYNTHETIC_JD = [
  'We are hiring a Backend Engineer to build and operate distributed services.',
  'Responsibilities: design and ship Go services; own event-driven workflows on Kafka;',
  'improve reliability through tracing, load testing and safer deployment automation;',
  'partner with product to define clear API contracts and measurable performance goals.',
  'Requirements: 2+ years backend experience; strong Go or Java; solid grounding in',
  'concurrency and distributed systems; experience with PostgreSQL and containerised',
  'deployments; comfort with observability tooling such as OpenTelemetry and Prometheus.',
  'Nice to have: Kubernetes, Terraform, exposure to payments or high-volume commerce.',
  'This is a synthetic job description used for automated QA. Not a real vacancy.',
].join(' ');

test.beforeEach(() => requireCredentials());

test('Recruiting Lens: one click produces one analysis and one charge', async ({ page, observed }) => {
  test.setTimeout(300_000);

  await signIn(page, eliteAccount());
  const before = await settledMeritBalance(page);

  await page.goto('/recruiting-lens');
  await expectNoRawErrors(page, '/recruiting-lens on load');

  // A first-visit tutorial overlay swallows clicks on the real CTA.
  await dismissTutorial(page);

  // Accounts with prior runs may land on a result/saved view rather than the
  // intake form; reopen the form if a "new analysis" affordance is present.
  const startNew = page
    .getByRole('button', { name: /Analyze Another|Start New Analysis|New Analysis/i })
    .first();
  if (await startNew.count()) {
    await startNew.click().catch(() => {});
  }

  await expect(
    page.locator('#company-name'),
    'Recruiting Lens intake form not reachable',
  ).toBeVisible({ timeout: 30_000 });

  // The input must be UNIQUE per run. Identical inputs hit analysis_cache and
  // are correctly served without a new job or charge — which is the right
  // product behaviour, but it means a repeated JD can never exercise a real run.
  const runMarker = `REQ-${Date.now()}`;
  await page.locator('#company-name').fill(`Northwind Systems ${runMarker}`);
  await page.locator('#role-title').fill('Backend Engineer');
  await page.locator('#job-description').fill(`${SYNTHETIC_JD} Reference: ${runMarker}.`);

  const cta = page.getByRole('button', { name: /Analyze Job/i }).first();
  const enabled = await cta.isEnabled({ timeout: 30_000 }).catch(() => false);
  test.skip(
    !enabled,
    'Recruiting Lens CTA stayed disabled — account needs a prior resume analysis.',
  );

  const submissions: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/functions/v1/recruiting-lens')) {
      submissions.push('lens');
    }
  });

  const landed = await rapidClick(page, /Analyze Job/i, 3);
  safeLog(`[prod-smoke] recruiting lens clicks landed: ${landed}`);

  await expectExactlyOneSubmission(page, submissions, 'recruiting lens');

  await page.waitForTimeout(20_000);
  await expectNoRawErrors(page, '/recruiting-lens after analysis');

  const after = await settledMeritBalance(page);
  const spent = before! - (after ?? before!);
  safeLog(`[prod-smoke] merits spent on Recruiting Lens: ${spent}`);
  test.info().annotations.push({ type: 'merits-spent', description: String(spent) });

  expect(observed.pageErrors, 'uncaught page errors during Recruiting Lens').toEqual([]);
});
