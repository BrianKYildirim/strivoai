/**
 * Phase 02 · 02-05 · Fix 2 guard (SEC-13 / SEC-14) — grade-linkedin refund-after-save.
 *
 * The confirmed HIGH billing defect (DB-BILLING-WEBHOOK-FINDINGS Domain 12, Fix 2):
 * a POST-save `recordUsageWithAnalysis` failure threw `MeritRefundable(500, …)` (or
 * returned a 500) AFTER the `linkedin_grades` row was durably saved + the extract-webhook
 * and email had fired — refunding a Merit for an already-delivered analysis (double
 * benefit) and/or reporting a saved+emailed analysis to the user as a 500. Confirmed at
 * THREE post-save sites: merit-path (inside withMerits), free-path, and the legacy
 * non-withMerits path.
 *
 * The fix converts all THREE post-save usage-write FAILURE branches to log-and-continue
 * (keep the `log.error('usage-tracking-insert-failed', …)` reason-code line, drop the
 * throw / 500, fall through to the durable success response). The legitimate PRE-save
 * throw (`throw new MeritRefundable(500, 'Could not save LinkedIn grade history.')`,
 * before the row is durable) is preserved byte-identical — a refund is correct there.
 *
 * Guard class: STATIC-SOURCE (Class B, modeled on `grade-linkedin/free-scan.test.ts` +
 * `handler-config.test.ts`, incl. the Windows leading-slash path idiom). A runtime test
 * that imports the handler would perturb the stripe-webhook idempotency siblings in the
 * shared deno process (Pitfall 6), so this reads `index.ts` as text and asserts on it.
 *
 * Fail-before/pass-after (SEC-13 evidence): the "no post-save usage-write throw/500"
 * assertions FAIL on the pre-fix source (the message string appears 3×, the throw 3×)
 * and PASS after the fix (message gone, throw reduced to the single pre-save KEEP).
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

// ── KEEP — the legitimate PRE-save throw is byte-preserved ───────────────────

Deno.test('Fix2 [KEEP]: pre-save throw (before the linkedin_grades row is durable) is preserved byte-identical', () => {
  // Inside storeAndNotify, before the row exists → a refund is correct here. Do NOT touch.
  assertEquals(
    source.includes("throw new MeritRefundable(500, 'Could not save LinkedIn grade history.')"),
    true,
  );
});

// ── FIX — no post-save usage-write throw / 500 at any of the three sites ──────

Deno.test('Fix2: no post-save usage-write FAILURE branch throws MeritRefundable or 500s a delivered analysis', () => {
  // The usage-write failure message backed the throw at the merit-path (inside withMerits)
  // + free-path sites AND the return-500 at the legacy non-withMerits site. Its TOTAL
  // absence (3 occurrences pre-fix → 0 post-fix) proves all three post-save sites converted
  // to log-and-continue. This is the load-bearing fail-before/pass-after discriminator.
  assertEquals(source.includes('Could not record LinkedIn grade usage.'), false);
});

Deno.test('Fix2: the two post-save usage-write throws are removed (the legit pre-save refundable throws remain untouched)', () => {
  // The two post-save usage-write throws are gone specifically.
  assertEquals(
    countOccurrences(source, "throw new MeritRefundable(500, 'Could not record LinkedIn grade usage.')"),
    0,
  );
  // The legitimate PRE-save refundable throws are NOT collateral damage. 04-GAP-01
  // converged runTieredAiCall's parse+validate onto the single
  // `validateLinkedInModelResponse` seam, so the separate "parse-after-retry" throw
  // merged into the "validation-after-retry" throw: 4 pre-save refundable throws now
  // remain (AI-fail, retry-AI-fail, validation-after-retry-fail, + the save-history
  // KEEP) — all still PRE-save, so the refund boundary is unchanged. Guards against an
  // over-reach that strips a correct pre-save refund along with the two post-save ones.
  assertEquals(countOccurrences(source, 'throw new MeritRefundable'), 4);
});

// ── FALL-THROUGH — log-and-continue preserved + success returns intact ───────

Deno.test('Fix2: the usage-tracking-insert-failed reason-code line is retained (log-and-continue, not silent)', () => {
  // The post-save sites still LOG the failure (operator signal) — they just no longer
  // fail the user request.
  assertEquals(source.includes("log.error('usage-tracking-insert-failed'"), true);
});

Deno.test('Fix2: the merit/free post-save sites fall through to the durable success response', () => {
  // Both the free-path and merit-path branches return the already-built stored.response.
  assertEquals(source.includes('return stored.response;'), true);
});
