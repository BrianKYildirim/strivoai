/**
 * Phase 13 Wave 2 — D-06 branch presence test (BACK-01).
 * Reads analyze-resume/index.ts source and asserts merit-gateway integration.
 * Run with: deno test analyze-resume/merit-branch.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const src = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

Deno.test("analyze-resume imports withMerits from merit-gateway.ts (unconditional)", () => {
  assert(
    src.includes("withMerits") && src.includes("from '../_shared/merit-gateway.ts'"),
    "Expected withMerits import from '../_shared/merit-gateway.ts'",
  );
  assert(
    !src.includes("MERIT_SYSTEM_ENABLED"),
    "MERIT_SYSTEM_ENABLED must be removed from analyze-resume (Phase 30, D-15)",
  );
});

Deno.test("analyze-resume calls withMerits with feature='resume_analysis'", () => {
  assert(src.includes("withMerits("), "Expected withMerits( call site");
  assert(src.includes("'resume_analysis'"), "Expected feature key 'resume_analysis'");
});

Deno.test("analyze-resume imports MeritRefundable for refund signaling", () => {
  assert(src.includes("MeritRefundable"), "Expected MeritRefundable in source");
});
