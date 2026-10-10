/**
 * Phase 06 · 06-03 · FEAT-05 / Pattern 2 — career worker two-writer deferral guard.
 *
 * The highest-risk integration bug in the 3-function career dance is a DOUBLE WRITE /
 * DOUBLE REFUND: when ANALYSIS_LIFECYCLE_CAREER_COMPASS is ON, the executor (inside
 * analyze-career) already CAS'd the analysis_jobs row via transition_analysis_run
 * (saving→completed + merit_settled on success; refunded + failed/retryable_failed on
 * failure) AND owns the pre-saving refund. The worker (process-career-analysis-job)
 * must therefore DEFER — it must NOT independently drive status/state or refund, or a
 * raw write would stomp the executor's state and a raw refund would risk a double-refund.
 *
 * This static-source guard (comment-stripped so prose cannot satisfy it) proves:
 *   1. `deferToExecutor` is derived from isAnalysisFeatureEnabled('career_compass').
 *   2. Every raw analysis_jobs status write (completed / retrying / failed) is gated
 *      behind `if (!deferToExecutor)`.
 *   3. Every refundMeritsForJob call is gated behind `if (!deferToExecutor)` (no
 *      independent refund when the executor owns the money path — no double-refund).
 *   4. The flag-OFF path keeps every raw write + refund (byte-identical dormancy).
 *
 * Modeled on analyze-resume/__tests__/streaming-wrapper-ordering.test.ts (the two-writer
 * ordering-guard precedent). std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

function readWorkerCode(): string {
  const rawPath = new URL('../../process-career-analysis-job/index.ts', import.meta.url).pathname;
  const path = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
  return Deno.readTextFileSync(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

Deno.test('Pattern 2: deferToExecutor is derived from the career_compass feature flag', () => {
  const code = readWorkerCode();
  assert(
    /const\s+deferToExecutor\s*=\s*isAnalysisFeatureEnabled\(\s*'career_compass'\s*\)/.test(code),
    'the worker must compute deferToExecutor from isAnalysisFeatureEnabled(career_compass)',
  );
});

Deno.test('Pattern 2: every raw analysis_jobs status write is gated behind if (!deferToExecutor)', () => {
  const code = readWorkerCode();
  // Each raw completed/retrying/failed write must have an `if (!deferToExecutor)` guard
  // lexically preceding it (and closer than the previous status write).
  const statusWrites = [...code.matchAll(/status:\s*"(completed|retrying|failed)"/g)].map((m) => ({
    kind: m[1],
    idx: m.index ?? -1,
  }));
  // completed(1) + retrying(2: main + worker-catch) + failed(2: main + worker-catch) = 5 raw writes.
  assert(statusWrites.length >= 5, `expected >=5 raw status writes, found ${statusWrites.length}`);
  for (const w of statusWrites) {
    const guardIdx = code.lastIndexOf('!deferToExecutor', w.idx);
    assert(guardIdx !== -1, `a "${w.kind}" write at ${w.idx} must be preceded by an !deferToExecutor guard`);
    // The guard must be the nearest control-flow gate (no un-gated raw write path).
    const priorProcessing = code.lastIndexOf('status: "processing"', w.idx);
    assert(guardIdx > priorProcessing, `the "${w.kind}" write must be inside an !deferToExecutor block, not the ungated claim`);
  }
});

Deno.test('Pattern 2: every refundMeritsForJob call is gated behind if (!deferToExecutor) (no double-refund)', () => {
  const code = readWorkerCode();
  const refunds = [...code.matchAll(/refundMeritsForJob\(/g)].map((m) => m.index ?? -1);
  assertEquals(refunds.length, 2, 'the worker has exactly two refund sites (terminal-failure + worker-catch)');
  for (const idx of refunds) {
    const guardIdx = code.lastIndexOf('!deferToExecutor', idx);
    assert(guardIdx !== -1, `a refundMeritsForJob at ${idx} must be gated behind !deferToExecutor (executor owns the refund when ON)`);
  }
});

Deno.test('Pattern 2: raw status:"failed"/refund writes stay exactly on the flag-OFF path (no stomp/double-refund)', () => {
  const code = readWorkerCode();
  // The two raw `status:"failed"` writes (main terminal + worker-catch) and the two
  // refundMeritsForJob calls remain exactly two each and stay !deferToExecutor-gated
  // (tests above). The flag-ON path never adds a raw failed write or a bare refund —
  // it terminalizes via the shared CAS helper (asserted by the Bug 3 test below).
  assertEquals(
    [...code.matchAll(/status:\s*"failed"/g)].length,
    2,
    'exactly two raw status:"failed" writes (both flag-OFF gated)',
  );
  assertEquals(
    [...code.matchAll(/refundMeritsForJob\(/g)].length,
    2,
    'exactly two bare refundMeritsForJob calls (both flag-OFF gated); flag-ON refunds via the helper',
  );
});

// Bug 3 (hang-on-4xx): when analyze-career EARLY-RETURNS a permanent non-2xx BEFORE
// its executor ran, submit's pre-created run is orphaned non-terminal. The flag-ON
// worker must DETERMINISTICALLY terminalize it via the shared CAS helper (D-04:
// "failures never hang") — this is the assertion that would have caught the 95% hang.
Deno.test('Bug 3: the flag-ON worker deterministically terminalizes via terminalizeStuckRun', () => {
  const code = readWorkerCode();
  assert(
    /import\s*\{\s*terminalizeStuckRun\s*\}\s*from\s*['"]\.\.\/_shared\/terminalize-stuck-run\.ts['"]/.test(code),
    'the worker must import terminalizeStuckRun from _shared',
  );
  const calls = [...code.matchAll(/terminalizeStuckRun\(/g)];
  // Two deferred terminal paths: the response terminal-failure branch + the
  // worker-catch maxed-out branch. (Branch/no-stomp semantics are pinned by the
  // functional tests in _shared/terminalize-stuck-run.test.ts.)
  assert(calls.length >= 2, `expected >=2 terminalizeStuckRun call sites, found ${calls.length}`);
  // The failure code for the response terminal path is derived from the HTTP status.
  assert(
    /permanentCodeForStatus\(\s*resp\.status\s*\)/.test(code),
    'the response terminal-failure path must pass a status-derived permanent taxonomy code',
  );
});
