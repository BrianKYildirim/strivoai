/**
 * Phase 09 · 09-05 · FEAT-06 — Recruiting Lens refund-after-save boundary
 * (VER-02 S-19 refund / release handling).
 *
 * The refund-after-save defect class (Phase 02 · 02-05 "Fix 2", Pitfall 2): a POST-save
 * failure branch throws `MeritRefundable` (or 500s) AFTER the analysis row is durably
 * saved — refunding a Merit for an already-delivered analysis (double benefit) and/or
 * reporting a saved analysis to the user as a 500. It was fixed for analyze-resume,
 * analyze-career and grade-linkedin; RCL had no equivalent guard. This is that guard.
 *
 * SCOPE — the MIGRATED (lifecycle) money path. RCL's forward path is
 * `runAnalysisLifecycle(... save: async (value) => …)` (index.ts:584-695), which is the
 * path D-02 flips on production first. Every assertion below is scoped to that path plus
 * the shared executor boundary it inherits.
 *
 * ── FINDING 09-05-F1 — REPORTED by 09-05, FIXED before the staging activation ──────────
 * The LEGACY helper `persistRecruitingLensResult` carried the pre-Fix-2 shape: after the
 * durable `analysis_results` insert succeeded, a failing `recordUsageWithAnalysis` threw
 * `MeritRefundable(500, 'Could not record Recruiting Lens usage.')` — a post-save throw
 * that would refund an analysis the user had already received (double benefit) AND 500 it.
 * It was unreachable from the lifecycle save(), but WAS reachable from the two non-lifecycle
 * branches — including the `MERIT_SYSTEM_ENABLED`-on / lifecycle-off intermediate state that
 * a D-02 production flip necessarily passes through, on the first feature flipped.
 *
 * RCL was the last feature still carrying it; Phase 02 (Fix 2 / SEC-13) removed it from the
 * others. It now log-and-continues, matching `grade-linkedin/index.ts:612-617`.
 *
 * TWO assertions below lock this down, and they are complementary:
 *   - `FEAT-06 [F1]`  pins the ROUTING  — the lifecycle path never delegates to the legacy
 *                      helper. True before AND after the fix; it guards the containment.
 *   - `FEAT-06 [F1-fix]` pins the FIX   — no post-save refundable throw survives anywhere in
 *                      the legacy helper. This is what fails if the defect is reintroduced.
 *
 * Guard class: STATIC-SOURCE (Class B, the `grade-linkedin/refund-after-save.test.ts` /
 * `handler-config.test.ts` idiom, incl. the Windows leading-slash path fix). A runtime
 * test that imports the handler would perturb sibling suites in the shared deno process
 * (Pitfall 6), so this reads `index.ts` as text and asserts on it.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
// Strip the leading slash to get a valid Windows path (handler-config.test.ts idiom).
function readLocal(relative: string): string {
  const rawPath = new URL(relative, import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path);
}

const source = readLocal('../index.ts');

/** Comment-stripped source: prose must never be able to satisfy an assertion. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

/**
 * The lifecycle save() body — from `save: async (value) => {` to the end of the
 * runAnalysisLifecycle call. This is the ONLY durable-write path on the migrated flow.
 */
function lifecycleSaveBody(): string {
  const start = code.indexOf('save: async (value) =>');
  assert(start !== -1, 'the lifecycle save() callback must exist (index.ts:630)');
  const end = code.indexOf('if (lifecycleResult.ok)', start);
  assert(end !== -1, 'the lifecycle result branch must follow save()');
  return code.slice(start, end);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

// ── KEEP: the legitimate PRE-save refundable throw is preserved ───────────────

Deno.test('FEAT-06 [KEEP]: the pre-save throw (before the analysis_results row is durable) is preserved byte-identical', () => {
  // Inside save(), before the row exists → a refund is CORRECT here. The executor rests
  // the run in retryable_failed and the Merit is returned. Do NOT remove.
  assertEquals(
    source.includes("throw new MeritRefundable(500, 'Could not save Recruiting Lens analysis history.')"),
    true,
  );
});

Deno.test('FEAT-06 [KEEP]: the pre-save model-failure throws (all-overloaded 529 / all-calls-failed 500) remain refundable', () => {
  // generate() runs entirely before any durable write — refunding there is correct.
  assertEquals(source.includes("throw new MeritRefundable(529, 'All 3 calls overloaded')"), true);
  assertEquals(source.includes("throw new MeritRefundable(500, 'All analysis calls failed')"), true);
});

// ── FIX: no post-save throw inside the migrated lifecycle save() ──────────────

Deno.test('FEAT-06: the lifecycle save() has EXACTLY ONE MeritRefundable throw and it is the pre-save insert failure', () => {
  const body = lifecycleSaveBody();
  assertEquals(
    countOccurrences(body, 'throw new MeritRefundable'),
    1,
    'a second throw inside save() would necessarily sit after the durable insert',
  );
  const throwIdx = body.indexOf('throw new MeritRefundable');
  const insertIdx = body.indexOf("from('analysis_results').insert");
  const usageIdx = body.indexOf('recordUsageWithAnalysis');
  assert(insertIdx !== -1 && usageIdx !== -1, 'the durable insert + the post-save usage write must both exist');
  assert(
    throwIdx > insertIdx && throwIdx < usageIdx,
    'the only refundable throw must sit in the insert-failure branch — BEFORE the row is durable',
  );
});

Deno.test('FEAT-06: no post-save usage-write FAILURE branch throws MeritRefundable (a delivered analysis is never refunded)', () => {
  const body = lifecycleSaveBody();
  const postSave = body.slice(body.indexOf('recordUsageWithAnalysis'));
  assert(
    !/throw\s+new\s+MeritRefundable/.test(postSave),
    'a usage-write failure after the durable insert must be log-and-continue, never a refund',
  );
  // The legacy helper's discriminator string must NEVER appear on the lifecycle path.
  assertEquals(postSave.includes('Could not record Recruiting Lens usage.'), false);
});

Deno.test('FEAT-06: the post-save usage-write failure still LOGS (log-and-continue, not silent)', () => {
  const body = lifecycleSaveBody();
  const postSave = body.slice(body.indexOf('recordUsageWithAnalysis'));
  assert(
    postSave.includes("log.error('usage-tracking-insert-failed'"),
    'the operator signal must be retained — log-and-continue, not swallow-and-continue',
  );
});

Deno.test('FEAT-06: the post-save best-effort side-writes (application auto-create, History cache) are non-fatal', () => {
  const body = lifecycleSaveBody();
  // Both run AFTER the durable insert; neither may fail the delivered analysis.
  assert(body.includes('upsertSavedRecruitingLensJob'), 'the application auto-create must run from save()');
  assert(body.includes('writeRecruitingLensCache'), 'the History cache write must run from save()');
  assertEquals(source.includes("log.warn('applications-autocreate-failed'"), true);
  assertEquals(source.includes("console.warn('[recruiting-lens] cache write failed:'"), true);
});

// ── FINDING 09-05-F1 containment: the migrated path never reaches the legacy helper ──

Deno.test('FEAT-06 [F1]: the migrated lifecycle save() never calls persistRecruitingLensResult (the legacy durable-write helper)', () => {
  // Containment guard: the lifecycle path must own its own durable write. This pins the
  // ROUTING, not the defect, so it stays meaningful after F1 was fixed — it is what stops
  // any future post-save hazard in the legacy helper from reaching the flipped feature.
  const body = lifecycleSaveBody();
  assertEquals(
    body.includes('persistRecruitingLensResult'),
    false,
    'the lifecycle path must own its durable write — never delegate to the legacy helper',
  );
});

Deno.test('FEAT-06 [F1-fix]: no post-save refundable throw survives in the legacy persist helper (SEC-13 Fix 2)', () => {
  // The F1 defect: a usage-write failure AFTER the durable analysis_results insert threw
  // MeritRefundable, refunding an analysis the user had already received. The fix is
  // log-and-continue (grade-linkedin/index.ts:612-617). This assertion is what turns RED if
  // anyone reintroduces it — on ANY branch, not just the lifecycle one.
  assertEquals(
    code.includes('Could not record Recruiting Lens usage.'),
    false,
    'a usage-tracking failure must NOT throw after the durable save — it must log and continue, ' +
      'or a delivered analysis gets both refunded and 500ed (the exact hazard of the ' +
      'MERIT-on / lifecycle-off intermediate state a D-02 flip passes through)',
  );

  // Non-vacuity: the helper must still refund when the DURABLE SAVE ITSELF fails. That throw
  // is legitimate and must survive — otherwise this test would pass by deleting all error
  // handling, which is the failure class this phase exists to eliminate.
  assert(
    code.includes('Could not save Recruiting Lens analysis history.'),
    'the pre-save failure path must still raise MeritRefundable — a run that never persisted ' +
      'is genuinely refundable',
  );
});

// ── Shared executor boundary: no refund is reachable after the point of no return ──

Deno.test('FEAT-06: RCL routes its money path through runAnalysisLifecycle (inherits the Pitfall-2 boundary)', () => {
  assert(code.includes('runAnalysisLifecycle'), 'the shared executor is the refund-boundary owner');
  assert(code.includes("feature: 'recruiting_lens'"), 'wired for the recruiting_lens feature namespace');
  assert(code.includes("meritFeature: 'recruiting_lens'"), 'wired for the recruiting_lens merit namespace');
});

Deno.test('FEAT-06: NO refundMeritsForJob / MeritRefundable is reachable after the saving -> completed CAS (Pitfall 2)', () => {
  const executor = readLocal('../../_shared/analysis-lifecycle.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  const casIdx = executor.indexOf("'saving', 'completed'");
  assert(casIdx !== -1, 'the saving -> completed CAS must exist');
  const postSaving = executor.slice(casIdx);
  assert(!postSaving.includes('refundMeritsForJob'), 'refund must be lexically unreachable after saving -> completed');
  assert(!/throw\s+new\s+MeritRefundable/.test(postSaving), 'no MeritRefundable throw after the point of no return');
});
