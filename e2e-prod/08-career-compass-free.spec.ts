/**
 * Flow 8 — Career Compass on the FREE tier, saved-resume path.
 *
 * WHY THIS EXISTS
 * ---------------
 * `04-career-compass.spec.ts` covers `eliteAccount` only. The 2026-08-04
 * production incident was FREE-tier specific: a brand-new Free user completed
 * onboarding, came back in a LATER session, ran Career Compass against the
 * SAVED resume, and got
 *
 *   analyze-career:1876  400 "Unable to extract text from your resume."
 *   → process-career-analysis-job:15 maps 400 → INPUT_MISSING
 *   → job failed, merits refunded, generic "server error" toast
 *
 * (production jobs f201c112… and 67b8e64f…, both tier=free, refunded=true).
 *
 * Root cause: `resumes.extracted_text` was never persisted, and backend
 * raw-byte PDF parsing is an intentional no-op
 * (supabase/functions/_shared/pdf-parser.ts), so the saved-resume path had NO
 * source of resume text. Elite masked it — those accounts already had
 * `extracted_text` from before the regression, which is why Career Compass
 * "worked for Elite" while Free failed every time.
 *
 * WHAT THIS ASSERTS
 * -----------------
 *   1. the run COMPLETES (not "fails but refunds" — 04's stored-resume test
 *      accepts that outcome; this one does not),
 *   2. INPUT_MISSING never surfaces, on the wire or in the UI,
 *   3. the submitted payload actually CARRIES resume text — the single fact
 *      that was missing in production,
 *   4. exactly ONE Career Compass submission fires under rapid clicking,
 *   5. exactly ONE merit debit lands, equal to the advertised cost,
 *   6. NO refund on success (the balance does not bounce back).
 *
 * SCOPE / SAFETY
 *   - Runs ONLY against the disposable `freeAccount()`. Never a real user.
 *   - Reads no service-role key (suite contract). DB-level confirmation of the
 *     job row, `extracted_text` repair and the merit ledger is done separately,
 *     read-only, against production after the run.
 *   - COST: one real Career Compass analysis on the disposable Free account.
 */
import { test, expect, requireCredentials, expectNoRawErrors } from './helpers/fixtures';
import { freeAccount } from './helpers/env';
import { signIn, settledMeritBalance, rapidClick, expectExactlyOneSubmission } from './helpers/app';
import { safeLog } from './helpers/redact';

/** Career Compass advertises its price in the intake form: "Costs N Merits". */
async function advertisedCost(page: import('@playwright/test').Page): Promise<number | null> {
  const text = await page.locator('body').innerText().catch(() => '');
  const m = /Costs\s+(\d+)\s+Merits?/i.exec(text);
  return m ? Number(m[1]) : null;
}

test.beforeEach(() => requireCredentials());

test('Career Compass FREE: saved-resume path completes with one charge and no refund', async ({
  page,
}) => {
  test.setTimeout(300_000);

  await signIn(page, freeAccount());
  const before = await settledMeritBalance(page);
  expect(before, 'could not read the Free account merit balance').not.toBeNull();

  // ── Observation wiring, before any interaction ────────────────────────────
  const submissions: string[] = [];
  /** Did the submitted payload carry resume text? This is THE fix's signature. */
  let payloadTextLen = -1;
  page.on('request', (req) => {
    if (req.method() !== 'POST') return;
    if (!/\/functions\/v1\/(analyze-career|submit-career-analysis-job)/.test(req.url())) return;
    submissions.push('career');
    try {
      const body = req.postData();
      if (body) {
        const parsed = JSON.parse(body) as { resumeTextContent?: unknown };
        payloadTextLen =
          typeof parsed.resumeTextContent === 'string' ? parsed.resumeTextContent.length : 0;
      }
    } catch {
      /* body not JSON — leave as-is; the UI assertions still gate the run */
    }
  });

  // INPUT_MISSING can only reach the client through a response body or the job
  // status poll. Watch both rather than trusting the rendered copy alone.
  const taxonomyHits: string[] = [];
  page.on('response', async (res) => {
    if (!/\/functions\/v1\//.test(res.url())) return;
    const body = await res.text().catch(() => '');
    if (/INPUT_MISSING/.test(body)) taxonomyHits.push(res.url());
  });

  // The fix logs when it re-derives text for a row whose extracted_text was NULL.
  let recoveredText = false;
  page.on('console', (m) => {
    if (/saved resume text recovered/i.test(m.text())) recoveredText = true;
  });

  // ── Reach the intake form on the SAVED resume ─────────────────────────────
  await page.goto('/career-compass');
  await expectNoRawErrors(page, '/career-compass on load (free)');

  // Two possible entry views; settle before branching (checking too early races
  // React's fetch of any cached analysis).
  await expect(
    page.getByRole('button', { name: /Start New Analysis|Discover My Career Path/i }).first(),
    'neither Career Compass view rendered for the free account',
  ).toBeVisible({ timeout: 60_000 });

  const startNew = page.getByRole('button', { name: /Start New Analysis/i }).first();
  if (await startNew.count()) {
    // Clears the cached result to reveal the intake form. Not the analysis trigger.
    await startNew.click();
  }

  // Deliberately DO NOT upload — the saved onboarding resume is the whole point.
  const savedResume = page.getByText(/Using saved resume/i);
  const hasSaved = await savedResume.isVisible({ timeout: 30_000 }).catch(() => false);
  test.skip(
    !hasSaved,
    'The disposable Free account has no saved resume. Complete onboarding on it first — ' +
      'this spec exercises the later-session saved-resume path and cannot synthesise one.',
  );

  const cost = await advertisedCost(page);
  const cta = page.getByRole('button', { name: /Discover My Career Path/i }).first();
  await expect(cta, 'Career Compass CTA never became enabled').toBeEnabled({ timeout: 30_000 });

  // ── One deliberate action, clicked hard (duplicate-charge probe) ──────────
  const landed = await rapidClick(page, /Discover My Career Path/i, 3);
  safeLog(`[prod-smoke] free Career Compass — clicks landed:${landed}`);
  await expectExactlyOneSubmission(page, submissions, 'free Career Compass');

  // ── Terminal outcome ─────────────────────────────────────────────────────
  const success = page.getByRole('heading', { name: /Your Career Compass/i });
  const failure = page.getByText(/hiccup|Merits were refunded|server error|something went wrong/i);

  await expect
    .poll(
      async () => {
        if (await success.isVisible().catch(() => false)) return 'success';
        if (await failure.isVisible().catch(() => false)) return 'failed';
        return 'pending';
      },
      { timeout: 240_000, intervals: [3_000], message: 'free Career Compass never reached a terminal state' },
    )
    .toBe('success');

  // ── The incident signature must be absent ────────────────────────────────
  expect(
    taxonomyHits,
    `INPUT_MISSING surfaced on the wire — the production failure reproduced: ${taxonomyHits.join(', ')}`,
  ).toEqual([]);
  await expectNoRawErrors(page, '/career-compass after a free saved-resume run');

  // ── The payload carried resume text (pre-fix it did not) ─────────────────
  expect(
    payloadTextLen,
    'the submitted Career Compass payload carried NO resumeTextContent — this is the exact ' +
      'production defect (job 67b8e64f… had resumeFilePath but no resumeTextContent)',
  ).toBeGreaterThan(100);

  // ── Merits: exactly one debit, no refund ─────────────────────────────────
  const after = await settledMeritBalance(page);
  expect(after, 'could not read the Free account merit balance after the run').not.toBeNull();
  const spent = before! - after!;

  if (cost !== null) {
    expect(
      spent,
      `expected exactly one debit of ${cost} merits, saw a net change of ${spent}`,
    ).toBe(cost);
  } else {
    expect(spent, 'a successful run must debit merits exactly once').toBeGreaterThan(0);
  }

  // A refund would push the balance back up. Re-read after a settle window and
  // require it to hold — success must never refund.
  await page.waitForTimeout(10_000);
  const settled = await settledMeritBalance(page);
  expect(
    settled,
    `merits were refunded after a SUCCESSFUL run (balance moved ${after} → ${settled})`,
  ).toBe(after);

  safeLog(
    `[prod-smoke] free Career Compass PASSED — spent:${spent} recoveredText:${recoveredText} ` +
      `payloadTextLen:${payloadTextLen}`,
  );
  test.info().annotations.push({
    type: 'free-career-compass',
    description: `spent=${spent} recoveredText=${recoveredText} payloadTextLen=${payloadTextLen}`,
  });
});
