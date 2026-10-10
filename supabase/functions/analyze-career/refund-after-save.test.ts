/**
 * Phase 02 · gap-closure · CR-02 guard (SEC-13 / SEC-14) — analyze-career refund-after-save.
 *
 * CR-02 (HIGH, money-path): `persistCareerResultAndRecordUsage` threw
 * `MeritRefundable(500, 'Could not record career analysis usage.')` AFTER the
 * `analysis_results.insert()` row was durable AND the fire-and-forget email trigger had
 * fired. Called inside the `withMerits` callback at two sites (free/short-circuit + the
 * parallel fan-out), a throw there reaches the gateway and refunds a Merit for an
 * already-delivered + emailed analysis (double benefit). This is the IDENTICAL pattern
 * that 02-05 Fix 2 corrected in `grade-linkedin` (and CR-01 in analyze-resume). The fix
 * converts the POST-save usage-write FAILURE branch to log-and-continue (keep the
 * `params.log.error('usage-tracking-insert-failed', …)` reason line, drop the throw, fall
 * through to the durable `return data.id`). The PRE-save insert-failure throw
 * (`Could not save career analysis history.`, before the row is durable) is preserved
 * byte-identical: a refund is correct there.
 *
 * Guard class: STATIC-SOURCE (Class B, modeled on `grade-linkedin/refund-after-save.test.ts`
 * incl. the Windows leading-slash path idiom). A runtime import would pull the DB-touching /
 * Deno.serve siblings into the shared offline process (Pitfall 6), so this reads `index.ts`
 * as text and asserts on it.
 *
 * Fail-before/pass-after: the post-save message appears 1× on the pre-fix source (RED);
 * post-fix it is gone and the reason-code line + durable return remain (GREEN).
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

// ── CR-02 FIX — no post-save usage-write throw at persistCareerResultAndRecordUsage ──

Deno.test('CR-02: no post-save usage-write FAILURE branch throws MeritRefundable (delivered+emailed analysis is not refunded)', () => {
  // The unique post-save usage-write message backed the throw at
  // persistCareerResultAndRecordUsage. Its total absence (1 occurrence pre-fix → 0
  // post-fix) is the load-bearing fail-before/pass-after discriminator.
  assertEquals(source.includes('Could not record career analysis usage.'), false);
  assertEquals(
    countOccurrences(source, "throw new MeritRefundable(500, 'Could not record career analysis usage.')"),
    0,
  );
});

Deno.test('CR-02: the usage-tracking-insert-failed reason-code line is retained (log-and-continue, not silent)', () => {
  // The post-save site still LOGS the failure (operator signal) — it just no longer
  // refunds/500s the user request.
  assertEquals(source.includes("params.log.error('usage-tracking-insert-failed'"), true);
});

// ── KEEP — the PRE-save insert-failure throw is byte-preserved (a refund IS correct) ──

Deno.test('CR-02 [KEEP]: pre-save analysis_results-insert-failure throw is preserved byte-identical', () => {
  // Inside persistCareerResultAndRecordUsage, before the row is durable → a refund is
  // correct here. Do NOT touch.
  assertEquals(
    source.includes("throw new MeritRefundable(500, 'Could not save career analysis history.')"),
    true,
  );
});
