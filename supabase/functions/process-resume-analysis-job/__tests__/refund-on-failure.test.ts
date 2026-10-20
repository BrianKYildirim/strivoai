import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("../index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

// SC #5 (a): success path does NOT refund.
Deno.test("SC#5(a): completed branch does NOT call refundMeritsForJob", () => {
  // The completed branch is the `if (resp.ok)` arm of the response-path. Match
  // from `if (resp.ok)` to the next `continue;` and assert refundMeritsForJob is absent.
  const completedBranch = src.match(/if \(resp\.ok\)[\s\S]*?continue;/)?.[0] ?? "";
  assert(completedBranch.length > 0, "completed branch must exist");
  assert(
    !completedBranch.includes("refundMeritsForJob"),
    "completed branch must not call refundMeritsForJob",
  );
});

// SC #5 (b): response-path terminal failure refunds with persisted txId.
Deno.test("SC#5(b): response-path failed branch calls refundMeritsForJob with txId", () => {
  assert(
    /refundMeritsForJob\(\s*userId\s*,\s*txId\s*,/.test(src),
    "expected refundMeritsForJob(userId, txId, ...) call",
  );
  // Reason taxonomy: at least one of the two response-path reasons must appear.
  assert(
    /['"]retry_exhausted['"]|['"]non_retryable_error['"]/.test(src),
    "expected retry_exhausted or non_retryable_error reason string",
  );
});

// SC #5 (b)' (D-07): worker-catch `maxedOut===true` branch refunds.
Deno.test("SC#5(b)bis: worker-catch maxedOut branch calls refundMeritsForJob (D-07)", () => {
  const catchToFailed = src.match(/catch \(processError\)[\s\S]*?status:\s*["']failed["']/)?.[0] ?? "";
  assert(catchToFailed.length > 0, "catch-to-failed segment must exist");
  assert(
    catchToFailed.includes("refundMeritsForJob"),
    "worker-catch maxedOut branch must call refundMeritsForJob (D-07)",
  );
  assert(/['"]worker_exception['"]/.test(catchToFailed),
    "expected reason 'worker_exception' in catch branch");
});

// SC #5 (c): re-process of already-failed job — idempotency delegated to RPC.
Deno.test("SC#5(c): worker imports refundMeritsForJob (idempotency delegated to RPC)", () => {
  assert(
    /import \{[^}]*refundMeritsForJob[^}]*\} from ['"]\.\.\/_shared\/merit-gateway\.ts['"]/.test(src),
    "expected import { refundMeritsForJob } from '../_shared/merit-gateway.ts'",
  );
  assert(
    src.includes("alreadyRefunded") || src.includes("already_refunded"),
    "worker or helper must acknowledge the already_refunded path",
  );
});

// SC #5 (d): pre-migration NULL txid → warn, skip refund.
Deno.test("SC#5(d): pre-migration null txid → warn, skip refund", () => {
  assert(
    /console\.warn\([\s\S]*?pre_migration_null_txid/.test(src),
    "expected console.warn(... 'pre_migration_null_txid' ...)",
  );
  // Negative check: pre_migration_null_txid is NOT passed to refundMeritsForJob.
  assert(
    !/refundMeritsForJob\([^)]*pre_migration_null_txid/.test(src),
    "pre_migration_null_txid must NEVER be passed as a refund reason",
  );
});

// Bonus invariant (D-09): no refund call when txId is null.
Deno.test("D-09: refund call is guarded by `if (!txId)` short-circuit", () => {
  assert(
    /if \(!txId\)\s*\{\s*console\.warn/.test(src),
    "expected `if (!txId) { console.warn(...) }` short-circuit before refund call",
  );
});

// SC #1 / SC #2: SELECT projection includes merit_transaction_id (worker reads it).
Deno.test("SC#2-mirror: SELECT projection includes merit_transaction_id", () => {
  assert(
    /\.select\(["'][^"']*merit_transaction_id[^"']*["']\)/.test(src),
    "expected SELECT projection to include merit_transaction_id",
  );
});

// CONTEXT § Specifics: KNOWN GAP / REQUIRED FOLLOW-UP comment removed.
Deno.test("CONTEXT-specifics: REQUIRED FOLLOW-UP comment is removed", () => {
  assert(
    !/REQUIRED FOLLOW-UP|KNOWN GAP/.test(src),
    "REQUIRED FOLLOW-UP / KNOWN GAP comment block must be deleted",
  );
});

Deno.test("AC-09: worker forwards the exact elite_unlock contract to analyze-resume", () => {
  assert(src.includes("const analysisPayload = payload.mode === 'elite_unlock'"));
  assert(src.includes("mode: 'elite_unlock'"));
  assert(src.includes("baseAnalysisId: payload.baseAnalysisId"));
  assert(src.includes("userId: job.user_id"), "owner must come from the claimed job row");
  assert(src.includes("meritTransactionId: job.merit_transaction_id"));
  assert(src.includes("body: JSON.stringify(analysisPayload)"));
});

Deno.test("AC-02/07: worker delegates and contains no delta generation or persistence", () => {
  assert(!src.includes("buildEliteUnlockDetailsPrompt"));
  assert(!src.includes("buildEliteUnlockExtrasPrompt"));
  assert(!src.includes("mergeEliteUnlockPatch"));
  assert(!src.includes("persist_resume_elite_unlock"));
});

Deno.test("AC-07/09: queue failures keep the existing single refund owner", () => {
  assert(src.includes("refundMeritsForJob(userId, txId"));
  assert(src.includes("alreadyRefunded"));
  assert(src.includes("retry_exhausted"));
  assert(src.includes("non_retryable_error"));
});
