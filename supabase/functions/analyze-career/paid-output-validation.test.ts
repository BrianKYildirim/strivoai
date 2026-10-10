/**
 * Career Compass output-completeness validation guards.
 *
 * RULE-1 FLIP (quick task 260713-hrd). This suite used to assert the OLD contract:
 * completeness was checked for Pro/Elite and *deliberately bypassed for Free*
 * (`if (tier === 'free') return;`).
 *
 * That bypass was catastrophic in combination with RC-1: because the internal worker path
 * resolved EVERY run to tier 'free', the bypass meant NOTHING was ever validated. A model
 * response truncated at the 2,500-token cap — one with no `roles` key at all — was repaired
 * by `repairTruncatedJSON`, passed straight through the disabled assertion, and was written
 * to `analysis_results` as a successful, billed analysis.
 *
 * The new contract, asserted below:
 *   • completeness is enforced at EVERY tier, Free included;
 *   • the required set is TIER-AWARE (Free owes a narrower set than Elite);
 *   • an incomplete result throws `CareerIncompleteOutput` — a DISTINCT type, so the 422
 *     terminal mapping cannot accidentally swallow a transient `MeritRefundable(500)` from
 *     the persist/OCR paths;
 *   • validation still runs BEFORE persistence and before any cache write.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function winSafePath(url: string): string {
  const raw = new URL(url, import.meta.url).pathname;
  return raw.startsWith("/") && raw[2] === ":" ? raw.slice(1) : raw;
}

const source = await Deno.readTextFile(winSafePath("./index.ts"));

Deno.test("completeness validation defines all EIGHT Career Compass core sections", () => {
  // Six original labels + the two 260713-hrd added: a Free result without Career DNA is not
  // a Free result, and an Elite result without a skills-gap analysis is not an Elite result.
  for (
    const label of [
      "Career DNA",
      "Best-Fit Roles",
      "Surprise Fits",
      "Fields",
      "Roles",
      "Readiness",
      "Roadmap",
      "Skill Gaps",
    ]
  ) {
    assert(source.includes(label), `missing validation label: ${label}`);
  }
  assert(source.includes("CAREER_CORE_SECTION_CHECKS"));
  assert(source.includes("getMissingCareerSections"));
});

Deno.test("completeness is enforced for EVERY tier — the Free bypass is gone", () => {
  assert(
    !source.includes("if (tier === 'free') return;"),
    "the Free completeness bypass must be gone — a truncated Free result must never persist",
  );
  assert(source.includes("CAREER_REQUIRED_SECTIONS"), "the required set must be tier-aware");
  assert(source.includes("Career Compass output missing required sections"));
});

Deno.test("an incomplete output throws the NARROW CareerIncompleteOutput type, not a bare MeritRefundable", () => {
  // ED-5 containment. `MeritRefundable(500)` is ALSO thrown by persistCareerResultAndRecordUsage
  // (a transient analysis_results save blip) and by the DOCX/OCR helpers. If incompleteness threw
  // a bare MeritRefundable and the tail caught it broadly, a recoverable DB hiccup would be
  // reclassified as a deterministic, terminal, refunded failure the worker refuses to retry.
  assert(source.includes("class CareerIncompleteOutput"), "the distinct type must exist");
  assert(
    source.includes("throw new CareerIncompleteOutput"),
    "incompleteness must throw the distinct type",
  );
  assert(
    source.includes("instanceof CareerIncompleteOutput"),
    "the 422 mapping must key off the distinct type",
  );
});

Deno.test("Free's required set excludes roadmap/skillGaps; Elite's includes them", () => {
  const block = source.slice(
    source.indexOf("CAREER_REQUIRED_SECTIONS"),
    source.indexOf("CAREER_CACHE_MAX_CONTEXT_CHARS"),
  );
  const freeLine = block.split("\n").find((l) => l.trim().startsWith("free:")) ?? "";
  const eliteLine = block.split("\n").find((l) => l.trim().startsWith("elite:")) ?? "";

  assert(freeLine.includes("careerDNA"), "Free must still owe Career DNA");
  assert(freeLine.includes("roles"), "Free must still owe roles");
  assert(!freeLine.includes("roadmap"), "Free must NOT owe a roadmap (locked Free scope)");
  assert(!freeLine.includes("skillGaps"), "Free must NOT owe a skills-gap analysis (locked Free scope)");

  assert(eliteLine.includes("roadmap"), "Elite is paid for the roadmap — it must be required");
  assert(eliteLine.includes("skillGaps"), "Elite is paid for the skills gap — it must be required");
});

Deno.test("validation runs before persistence and cache writes on new successful outputs", () => {
  const firstValidation = source.indexOf("assertCareerOutputComplete(analysisResult");
  const firstPersist = source.indexOf("persistCareerResultAndRecordUsage(supabase");
  const firstCacheWrite = source.indexOf("writeCareerAnalysisCache(supabase");

  assert(firstValidation > -1, "expected the completeness validation call");
  assert(firstPersist > -1, "expected persistence call");
  assert(firstCacheWrite > -1, "expected cache write call");
  assert(firstValidation < firstPersist, "validation must run before persistence");
  assert(firstValidation < firstCacheWrite, "validation must run before cache write");
});

Deno.test("validation checks the fields that back each user-facing section", () => {
  const requiredSnippets = [
    "hasNonEmptyArray(data.careerFields)",
    "hasNonEmptyArray(data.roles)",
    "data.roleReadinessBreakdown",
    "hasNonEmptyArray(data.roadmap) || hasNonEmptyArray(data.roleRoadmaps)",
    "hasNonEmptyArray(data.skillGaps)",
  ];

  for (const snippet of requiredSnippets) {
    assertEquals(source.includes(snippet), true, `missing snippet: ${snippet}`);
  }
});

// Surprise Fits has a COUNT contract expressed through CAREER_SURPRISE_FITS_MIN, not a mere
// presence check via `hasNonEmptyArray`. 260713-hrd originally set the floor at 2; the
// release-readiness audit (2026-07-15, operator decision) lowered it to 1 because real
// Anthropic output reliably under-produces cross-domain Surprise Fits, and a COMPLETE report
// with 1 strong fit should succeed rather than 422 + refund + force a rerun. The floor is
// still enforced through the NAMED CONSTANT (not a hardcoded length or a presence-only check)
// so the count contract cannot silently decay. MAX stays 3 (next test).
Deno.test("Surprise Fits floor is enforced through CAREER_SURPRISE_FITS_MIN (currently 1)", () => {
  assertEquals(source.includes("const CAREER_SURPRISE_FITS_MIN = 1;"), true);
  assertEquals(
    source.includes("Array.isArray(data.surpriseFits) && data.surpriseFits.length >= CAREER_SURPRISE_FITS_MIN"),
    true,
    "surpriseFits completeness must assert the floor via the named constant, not hasNonEmptyArray",
  );
  // The weaker presence-only check must NOT come back for surpriseFits.
  assertEquals(
    source.includes("hasNonEmptyArray(data.surpriseFits)"),
    false,
    "surpriseFits must not fall back to a presence-only check",
  );
});

Deno.test("Surprise Fits is capped at a MAXIMUM of 3 before validation and persistence", () => {
  assertEquals(source.includes("const CAREER_SURPRISE_FITS_MAX = 3;"), true);
  assertEquals(source.includes("function capCareerSurpriseFits"), true);

  // The cap must run on every path that shapes a result, and BEFORE the completeness gate.
  const capCalls = source.split("capCareerSurpriseFits(analysisResult").length - 1;
  assertEquals(capCalls >= 3, true, `expected the cap on all 3 shaping paths, found ${capCalls}`);

  const firstCap = source.indexOf("capCareerSurpriseFits(analysisResult");
  const firstValidation = source.indexOf("assertCareerOutputComplete(analysisResult");
  assertEquals(firstCap < firstValidation, true, "the cap must run before the completeness gate");
});

Deno.test("Elite constrained output uses three envelopes, awaited together and merged before validation", () => {
  assert(
    source.includes("getCareerOutputSchema(isElite ? 'elite' : 'free', 'base')"),
    "the live base call must use the base schema",
  );
  assert(
    source.includes("getCareerOutputSchema('elite', 'growth')"),
    "the Elite growth call must use its smaller schema",
  );
  assert(
    source.includes("getCareerOutputSchema('elite', 'elite-extras')"),
    "the Elite compensation call must use its smaller schema",
  );
  assert(
    source.includes("await Promise.all([basePromise, growthPromise, extrasPromise])"),
    "the split calls must remain parallel under the shared request deadline",
  );
  assert(
    source.includes("Object.assign(analysisResult, JSON.parse(growthRepair.json))"),
    "Elite growth must be merged before shaping and completeness validation",
  );
  assert(
    source.includes("Object.assign(analysisResult, eliteExtrasData)"),
    "Elite extras must be merged before shaping and completeness validation",
  );
  assert(
    source.includes("compensation.applicationStrategy = eliteExtrasData.smartApplicationStrategy"),
    "the established top-level strategy contract must be mirrored into the current UI field",
  );
});
