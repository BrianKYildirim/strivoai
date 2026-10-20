/**
 * Phase 02 · gap-closure · CR-01 + IN-02 guard (SEC-13 / SEC-14) — analyze-resume
 * refund-after-save + resume-ownership (IDOR) defense-in-depth.
 *
 * CR-01 (HIGH, money-path): `completeAndRecordSuccess` threw
 * `MeritRefundable(500, 'Could not record resume analysis usage.')` AFTER both
 * `resumes.update()` and `persistResumeAnalysis()` (the analysis_results row) were
 * durable — refunding a Merit for an already-delivered analysis (double benefit) and
 * 500-ing a saved analysis. This is the IDENTICAL pattern that 02-05 Fix 2 corrected in
 * `grade-linkedin`, which was not applied here. The fix converts the POST-save
 * usage-write FAILURE branch to log-and-continue (keep the `console.error(...)` reason
 * line, drop the throw, `return analysisId`).
 *
 * 05-01 RECONCILIATION (T-05-01 / D-10): the triple-write authority was tightened so
 * resumes.grading_data (completeAndRecordSuccess) is the SOLE authoritative
 * throws-pre-settle write and analysis_results is a best-effort MIRROR. Because the
 * mirror insert runs AFTER resumes.grading_data is durable, its old
 * `Could not save resume analysis history.` throw was itself a refund-after-save and is
 * now demoted to log-and-continue (return null). Only ONE pre-save throw remains — the
 * resume-update failure (`Could not save resume analysis.`) — preserved byte-identical:
 * a refund is correct there (the durable row never landed).
 *
 * IN-02 (LOW, IDOR): `resumes.update(...).eq('id', params.resumeId)` used the
 * service-role client (bypasses RLS) filtered ONLY by resume id. `resumeId` is
 * request-controlled (`rawBody.resumeId`), so an authenticated user could overwrite
 * ANOTHER user's `grading_data`/`overall_score`. The fix adds `.eq('user_id',
 * params.userId)` (params.userId is the JWT-authenticated userContext.userId) — a
 * legitimate own-resume analysis still matches; only cross-user overwrites are blocked.
 *
 * Guard class: STATIC-SOURCE (Class B, modeled on `grade-linkedin/refund-after-save.test.ts`
 * incl. the Windows leading-slash path idiom). A runtime import of this handler would pull
 * the DB-touching / Deno.serve siblings into the shared offline process (Pitfall 6), so this
 * reads `index.ts` as text and asserts on it.
 *
 * Fail-before/pass-after: the post-save message appears 1× and the `.eq('user_id',
 * params.userId)` filter is absent on the pre-fix source (RED); post-fix the message is
 * gone and the ownership filter is present (GREEN).
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
// Strip the leading slash to get a valid Windows path (handler-config.test.ts idiom).
const rawPath = new URL('./index.ts', import.meta.url).pathname;
const INDEX_PATH = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const source = Deno.readTextFileSync(INDEX_PATH);

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

// ── CR-01 FIX — no post-save usage-write throw at the completeAndRecordSuccess site ──

Deno.test('CR-01: no post-save usage-write FAILURE branch throws MeritRefundable (delivered analysis is not refunded)', () => {
  // The unique post-save usage-write message backed the throw at completeAndRecordSuccess.
  // Its total absence (1 occurrence pre-fix → 0 post-fix) is the load-bearing fail-before/
  // pass-after discriminator that the post-save site converted to log-and-continue.
  assertEquals(source.includes('Could not record resume analysis usage.'), false);
  assertEquals(
    countOccurrences(source, "throw new MeritRefundable(500, 'Could not record resume analysis usage.')"),
    0,
  );
});

Deno.test('CR-01: the usage-write reason-code line is retained (log-and-continue, not silent)', () => {
  // The post-save site still LOGS the failure (operator signal) — it just no longer
  // refunds/500s the user request.
  assertEquals(source.includes('[completeAndRecordSuccess] usage write failed:'), true);
});

// ── KEEP — the two PRE-save throws are byte-preserved (a refund IS correct there) ──

Deno.test('CR-01 [KEEP]: pre-save resume-update-failure throw is preserved byte-identical', () => {
  // resumes.update() failure → the row is not durable → a refund is correct. Do NOT touch.
  assertEquals(source.includes("throw new MeritRefundable(500, 'Could not save resume analysis.')"), true);
});

Deno.test('05-01 [RECONCILED]: analysis_results-mirror insert failure is demoted to log-and-continue (no refund-after-save)', () => {
  // Phase 05-01 (T-05-01 / D-10) tightened the triple-write reconciliation: the
  // AUTHORITATIVE throws-pre-settle durable write is resumes.grading_data
  // (completeAndRecordSuccess), which runs BEFORE persistResumeAnalysis. The
  // analysis_results insert is a MIRROR that executes AFTER the analysis is already
  // durable, so its old `throw new MeritRefundable(500, 'Could not save resume
  // analysis history.')` was a refund-AFTER-save (Merit refunded on an
  // already-delivered analysis). It is demoted to log-and-continue / return null,
  // matching grade-linkedin/persistLinkedInAnalysis. The throw is GONE — this is a
  // STRICTLY SAFER SEC-14 posture (one fewer refund-after-durable-save), not a
  // weakening. The resumes.grading_data throw below remains the sole authoritative
  // pre-save refund.
  assertEquals(
    source.includes("throw new MeritRefundable(500, 'Could not save resume analysis history.')"),
    false,
  );
  // The mirror-insert failure still LOGS (operator signal); it just no longer
  // refunds/500s a delivered analysis.
  assertEquals(source.includes('[persistResumeAnalysis] insert failed:'), true);
});

// ── IN-02 FIX — resume update is scoped to the authenticated owner (IDOR defense) ──

Deno.test('IN-02: resumes.update is scoped to the authenticated user (user_id ownership filter present)', () => {
  // rawBody.resumeId is request-controlled + the service-role client bypasses RLS, so the
  // update MUST also filter by the authenticated user_id. params.userId is threaded as
  // userContext.userId at the (single, merit-gated) call site — a legitimate own-resume
  // analysis still matches; a cross-user resumeId matches 0 rows (no overwrite).
  assertEquals(source.includes(".eq('user_id', params.userId)"), true);
  // The original id filter is preserved (defense-in-depth is additive, not a replacement).
  assertEquals(source.includes(".eq('id', params.resumeId)"), true);
});
