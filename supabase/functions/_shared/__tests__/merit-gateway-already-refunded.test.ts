// Phase 26 · Plan 01 · Task 3 (D-02) — source-grep test for the
// `refundMeritsForJob` extension that surfaces the RPC's `already_refunded`
// idempotent body cleanly. Source-grep style is consistent with the merit
// branch test pattern (analyze-resume/merit-branch.test.ts) — no fetch-stub
// harness exists for the merit-gateway helpers.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("../merit-gateway.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

Deno.test("D-02: refundMeritsForJob destructures data + error", () => {
  assert(
    /const \{ data, error \} = await supabase\.rpc\(['"]refund_merits['"]/.test(src),
    "expected `const { data, error } = await supabase.rpc('refund_merits', ...)` destructure",
  );
});

Deno.test("D-02: refundMeritsForJob recognizes already_refunded in data", () => {
  assert(src.includes("already_refunded"), "expected 'already_refunded' literal");
  assert(/alreadyRefunded\s*:\s*true/.test(src), "expected `alreadyRefunded: true` return field");
});

Deno.test("D-02: already_refunded path logs at info level", () => {
  assert(
    /log\.info\(\s*['"]merit-refund-already-refunded['"]/.test(src),
    "expected log.info('merit-refund-already-refunded', ...) call",
  );
});

Deno.test("D-02: transport error path still returns { ok: false }", () => {
  // Sanity check that the existing error branch wasn't accidentally removed.
  assert(
    /return \{ ok: false, error: error\.message \}/.test(src),
    "expected `return { ok: false, error: error.message }` in transport-error branch",
  );
});
