/**
 * Source-grep and structural tests for lifecycle-archive-writer/index.ts
 * (Phase 42 L5 DB-LIF-02).
 *
 * Run with: deno test supabase/functions/lifecycle-archive-writer/__tests__/lifecycle-archive-writer.test.ts --no-check --allow-read
 *
 * These tests use the source-grep pattern (consistent with _shared/__tests__/merit-gateway-already-refunded.test.ts)
 * to assert structural invariants without a live network stub harness.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Read the source file (path relative to this test file)
const srcPath = new URL("../index.ts", import.meta.url).pathname.replace(
  /^\/([A-Z]:)/,
  "$1",
);
const src = await Deno.readTextFile(srcPath);

// ── Test (a): Auth required — function calls requireAuth({type:'internal'}) ──

Deno.test("(a) auth-required: handler calls requireAuth with type:'internal'", () => {
  assert(
    src.includes("requireAuth(req, { type: \"internal\" })"),
    "Expected requireAuth(req, { type: 'internal' }) call — internal-only endpoint",
  );
});

Deno.test("(a) auth-required: 401 response returned on auth failure (throws are caught)", () => {
  assert(
    src.includes("if (authErr instanceof Response) return authErr"),
    "Expected `if (authErr instanceof Response) return authErr` to propagate 401",
  );
});

// ── Test (b): Eligible row archived — upload + UPDATE archive_path + NULL inline ──

Deno.test("(b) eligible-row-archived: uploads to ai-archives Storage bucket", () => {
  assert(
    src.includes('.from("ai-archives")'),
    "Expected .from('ai-archives') Storage call",
  );
  assert(
    src.includes(".upload(archivePath, gzipped,"),
    "Expected .upload(archivePath, gzipped, ...) call",
  );
});

Deno.test("(b) eligible-row-archived: UPDATE sets archive_path and nulls inline column atomically", () => {
  assert(
    src.includes("archive_path: archivePath"),
    "Expected `archive_path: archivePath` in update payload",
  );
  assert(
    src.includes("[inlineColumn]: null"),
    "Expected `[inlineColumn]: null` to null the inline column on archive",
  );
});

// ── Test (c): Upload failure — inline preserved, archive_path remains NULL ──

Deno.test("(c) upload-failure: on upload error, inline is NOT nulled and archive_path stays NULL", () => {
  // The control flow check: if uploadError exists, we `continue` (skip the UPDATE)
  assert(
    /if \(uploadError\)/.test(src),
    "Expected `if (uploadError)` guard before the UPDATE call",
  );
  // Verify the continue statement follows the uploadError log
  const uploadErrorBlock = src.slice(src.indexOf("if (uploadError)"));
  const continueIdx = uploadErrorBlock.indexOf("continue;");
  const updateIdx = uploadErrorBlock.indexOf(".update(");
  assert(
    continueIdx < updateIdx,
    "Expected `continue` before `.update()` so inline is never nulled on upload failure",
  );
});

// ── Test (d): Already-archived row skipped (archive_path non-NULL filter) ──

Deno.test("(d) already-archived-skipped: SELECT filters archive_path IS NULL", () => {
  assert(
    src.includes('.is("archive_path", null)'),
    "Expected `.is('archive_path', null)` filter to skip already-archived rows",
  );
});

// ── Test (e): job_descriptions explicitly NOT processed ──

Deno.test("(e) job_descriptions-excluded: DATA_CLASSES array does NOT contain job_descriptions table", () => {
  // Extract the DATA_CLASSES array content
  const dataClassesStart = src.indexOf("const DATA_CLASSES: DataClass[] = [");
  assert(
    dataClassesStart !== -1,
    "Expected DATA_CLASSES array to be defined",
  );

  const dataClassesEnd = src.indexOf(
    "// NOTE: interview_quizzes",
    dataClassesStart,
  );
  const dataClassesSection = src.slice(dataClassesStart, dataClassesEnd);

  assert(
    !dataClassesSection.includes('"job_descriptions"'),
    "DATA_CLASSES must NOT contain 'job_descriptions' — it is SPEC-locked excluded",
  );
});

Deno.test("(e) job_descriptions-excluded: exclusion comment is present in source", () => {
  assert(
    src.includes("job_descriptions is INTENTIONALLY EXCLUDED"),
    "Expected explicit exclusion comment for job_descriptions in source",
  );
});

// ── Bonus: run_lifecycle_sweep RPC is called after archiving ──

Deno.test("bonus: run_lifecycle_sweep RPC is called after archiving loop", () => {
  assert(
    src.includes('supabase.rpc("run_lifecycle_sweep")'),
    "Expected supabase.rpc('run_lifecycle_sweep') call after archiving",
  );
});

// ── Bonus: uses CompressionStream (native gzip, no new deps) ─────────────────

Deno.test("bonus: uses native CompressionStream('gzip') for zero new dependencies", () => {
  assert(
    src.includes('new CompressionStream("gzip")'),
    "Expected native CompressionStream('gzip') — zero new dependencies (Deno 2+ / Supabase edge runtime)",
  );
});
