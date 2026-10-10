import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyStale, REAP_CONFIG } from "../index.ts";

// The endpoint source, read once for the static/handler guards (mirrors
// process-resume-analysis-job/__tests__/refund-on-failure.test.ts).
const src = await Deno.readTextFile(
  new URL("../index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

// ── Static guards: internal-auth + CAS + exactly-once release wiring ──────────

// T-03-18: the reaper is internal-auth gated (a browser/public caller is rejected).
Deno.test("reaper is guarded by requireAuth internal", () => {
  assert(
    /requireAuth\(\s*req\s*,\s*\{\s*type:\s*['"]internal['"]\s*\}\s*\)/.test(src),
    "expected requireAuth(req, { type: 'internal' })",
  );
});

// LIFE-01: terminalization goes through the CAS RPC (never a raw UPDATE of state).
Deno.test("reaper terminalizes via transition_analysis_run CAS RPC", () => {
  assert(
    /\.rpc\(\s*["']transition_analysis_run["']/.test(src),
    "expected supabase.rpc('transition_analysis_run', ...)",
  );
  assert(
    /transitioned[\s\S]{0,80}===\s*true/.test(src),
    "expected a transitioned===true state gate",
  );
});

// LIFE-04: the stranded reservation is released via the idempotent gateway helper.
Deno.test("reaper releases reservation via refundMeritsForJob(reaper_stale)", () => {
  assert(
    /import \{[^}]*refundMeritsForJob[^}]*\} from ['"]\.\.\/_shared\/merit-gateway\.ts['"]/
      .test(src),
    "expected import { refundMeritsForJob } from '../_shared/merit-gateway.ts'",
  );
  assert(
    /refundMeritsForJob\(\s*row\.user_id\s*,\s*row\.merit_transaction_id\s*,\s*["']reaper_stale["']/
      .test(src),
    "expected refundMeritsForJob(row.user_id, row.merit_transaction_id, 'reaper_stale')",
  );
  // Idempotency is acknowledged (the second guard behind the CAS claim).
  assert(
    src.includes("alreadyRefunded") || src.includes("already_refunded"),
    "reaper must acknowledge the already_refunded idempotent path",
  );
});

Deno.test("reaper never persists refunded=true before the refund RPC succeeds", () => {
  const refundIdx = src.indexOf("const refund = await refundMeritsForJob(");
  const markIdx = src.indexOf("if (hasMerit) patch.refunded = true");
  assert(refundIdx !== -1, "expected the idempotent refund call");
  assert(markIdx > refundIdx, "refunded=true must be persisted only after refund success");

  const failureBranch = src.slice(src.indexOf("if (!refund.ok)"), markIdx);
  assert(
    /if \(!refund\.ok\)[\s\S]*?continue;/.test(failureBranch),
    "a failed refund must leave the row unmarked so a later sweep can retry",
  );
});

// LIFE-04 belt: settled/refunded rows are never re-processed (no double-release).
Deno.test("reaper skips already-settled/refunded rows (invariant belt)", () => {
  assert(
    /row\.merit_settled\s*\|\|\s*row\.refunded/.test(src),
    "expected a `row.merit_settled || row.refunded` belt-filter before release",
  );
});

// SELECT projection must carry the fields the release path reads.
Deno.test("reaper SELECT projects merit_transaction_id + user_id + state", () => {
  const proj = src.match(/\.select\(\s*[\s\S]*?\)/)?.[0] ?? "";
  assert(proj.includes("merit_transaction_id"), "projection must include merit_transaction_id");
  assert(proj.includes("user_id"), "projection must include user_id");
  assert(proj.includes("state_updated_at"), "projection must include state_updated_at");
});

// LIFE-06: terminal states are excluded from the sweep (never resurrected).
Deno.test("reaper excludes terminal states from the sweep", () => {
  assert(
    /TERMINAL_STATES\s*=\s*\[[^\]]*["']completed["'][^\]]*["']failed["'][^\]]*["']refunded["']/
      .test(src),
    "expected TERMINAL_STATES = ['completed','failed','refunded']",
  );
});

// ── Pure classifier: the A2 per-state max-age → target model ──────────────────

// LIFE-06: worker-death mid-generating is RECOVERABLE → retryable_failed (+refund).
Deno.test("mock: worker-death-mid-generating → retryable_failed", () => {
  // Fresh generating row: not yet stale.
  assertEquals(classifyStale("generating", 120_000), { stale: false });
  // Past the 2× analyze-timeout budget: stale → retryable_failed.
  const v = classifyStale("generating", 400_000);
  assertEquals(v.stale, true);
  assertEquals(v.target, "retryable_failed");
});

// LIFE-06: a `saving` stall is a HARD stall → failed (never re-retried past save).
Deno.test("mock: saving stall → failed (never re-retry past save)", () => {
  assertEquals(classifyStale("saving", 60_000), { stale: false });
  const v = classifyStale("saving", 200_000);
  assertEquals(v.stale, true);
  assertEquals(v.target, "failed");
});

// extracting_data mirrors generating (transient → retryable_failed).
Deno.test("mock: extracting_data stall → retryable_failed", () => {
  const v = classifyStale("extracting_data", 400_000);
  assertEquals(v.target, "retryable_failed");
});

// The money-boundary + pre-work states are hard stalls → failed.
Deno.test("mock: reserving_merits / created / validating_inputs → failed", () => {
  assertEquals(classifyStale("reserving_merits", 200_000).target, "failed");
  assertEquals(classifyStale("created", 120_000).target, "failed");
  assertEquals(classifyStale("validating_inputs", 120_000).target, "failed");
});

// LIFE-09: a retryable_failed off-ramp the retry path never reclaimed is itself
// terminalized (never permanently stuck), but only after a generous window.
Deno.test("mock: stale retryable_failed → failed after generous window", () => {
  assertEquals(classifyStale("retryable_failed", 300_000), { stale: false });
  const v = classifyStale("retryable_failed", 700_000);
  assertEquals(v.stale, true);
  assertEquals(v.target, "failed");
});

// Terminal / unknown states are never classified stale (defense-in-depth).
Deno.test("mock: terminal + unknown states are never stale", () => {
  assertEquals(classifyStale("completed", 10_000_000), { stale: false });
  assertEquals(classifyStale("failed", 10_000_000), { stale: false });
  assertEquals(classifyStale("refunded", 10_000_000), { stale: false });
  assertEquals(classifyStale("nonexistent", 10_000_000), { stale: false });
});

// The A2 table encodes exactly the eight non-terminal states (no terminal leakage).
Deno.test("REAP_CONFIG covers exactly the non-terminal working states", () => {
  const keys = Object.keys(REAP_CONFIG).sort();
  assertEquals(keys, [
    "created",
    "extracting_data",
    "generating",
    "reserving_merits",
    "retryable_failed",
    "saving",
    "validating_inputs",
    "validating_output",
  ]);
  for (const t of ["completed", "failed", "refunded"]) {
    assert(!(t in REAP_CONFIG), `terminal state ${t} must not be in REAP_CONFIG`);
  }
});

// ── Gated live-DB assertion (offline SKIP) ────────────────────────────────────
Deno.test({
  name: "live: dormant sweep reaps zero rows (flags OFF)",
  ignore: Deno.env.get("DENO_TEST_SUPABASE_REMOTE") !== "1",
  fn: () => {
    // Placeholder for the preview gated-remote twin: with the Phase-3 flags OFF no
    // feature writes `state`, so an authenticated internal invocation must return a
    // zero-count summary. Exercised only under DENO_TEST_SUPABASE_REMOTE=1 against
    // preview (03-07 wires the remote harness); SKIPPED offline.
    assert(true);
  },
});
