// Phase 04 Plan 04-01 (Task 1) — zod mirror of RecruitingLensOutput (byte-preserve validator).
//
// This is the strict output schema the shared analysis-lifecycle executor passes to
// `validateModelOutput` (LIFE-07). Its ONLY job is to reject a GENUINELY malformed
// merger output while ACCEPTING every field the merger currently emits — including
// the tier-shaped Pro subset produced by `applyRecruitingLensTierShape` (D-06
// byte-preserve). It must NEVER reject a currently-passing Elite or Pro output.
//
// Fixture parity: the full Elite object mirrors the merger test fixture
// (_shared/recruiting-lens-merger.test.ts:makeFullOutput). The Pro subset is derived
// by running the REAL shaper, so the test tracks the shaper's actual field-stripping.
//
// std@0.168.0 to match the recruiting-lens-merger.test.ts neighbor (two std-assert
// versions coexist in-repo; match the local convention). zod pinned to 3.25.76 (the
// repo-wide runtime pin used by llm-validation + interviewPrep types).

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  applyRecruitingLensTierShape,
  type RecruitingLensOutput,
} from "../_shared/recruiting-lens-merger.ts";
import { recruitingLensOutputSchema } from "./schema.ts";

// ── Fixture: a fully-merged Elite output (mirrors the merger fixture) ─────────

function makeFullEliteOutput(): RecruitingLensOutput {
  return {
    preAnalysis: { jdKeywords: ["react", "typescript"], dealBreakers: ["5+ years"], industry: "tech", culture: "startup" },
    overallMatch: { score: 72, label: "Moderate Match", summary: "Solid foundation with gaps." },
    subScores: {
      experienceAlignment: { score: 70, rationale: "Good experience alignment." },
      skillAlignment: { score: 65, rationale: "Missing some required skills." },
      impactStrength: { score: 80, rationale: "Strong impact metrics." },
      keywordAndLanguageMatch: { score: 55, rationale: "Some keywords missing." },
      credibilityAndSeniorityFit: { score: 75, rationale: "Good seniority fit." },
    },
    recruiterVerdict: "Worth advancing to phone screen.",
    scoreRationale: [{ category: "Technical Skills", strengths: ["React"], weaknesses: ["GraphQL"] }],
    topGaps: [
      { title: "Gap 1", severity: "critical", whyItMatters: "Matters 1", howItShowsUp: "Shows 1", fixPriority: "immediate" },
      { title: "Gap 2", severity: "high", whyItMatters: "Matters 2", howItShowsUp: "Shows 2", fixPriority: "short-term" },
      { title: "Gap 3", severity: "medium", whyItMatters: "Matters 3", howItShowsUp: "Shows 3", fixPriority: "long-term" },
    ],
    roadmap: [
      { stage: "immediate", action: "Fix resume", why: "Better match", expectedImpact: "+10" },
      { stage: "short-term", action: "Learn GraphQL", why: "Required skill", expectedImpact: "+15" },
      { stage: "medium-term", action: "Get cert", why: "Credibility", expectedImpact: "+5" },
      { stage: "long-term", action: "Lead projects", why: "Seniority", expectedImpact: "+8" },
    ],
    resumeEdits: [
      { original: "Old 1", rewritten: "New 1", qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
      { original: "Old 2", rewritten: "New 2", qualityGates: { jdVocab: true, achievementTransform: true, signalDensity: true, jdTargeting: true, pasteReady: true } },
    ],
    linkedinImprovements: [{ area: "headline", suggestion: "Update headline." }],
    strategicAdvice: { applyNow: true, summary: "Apply now.", biggestScoreMover: "Add GraphQL." },
    keywords: { matched: ["react"], missing: ["graphql"] },
    quickFixes: ["Fix typo", "Add keywords"],
    _meta: { totalGaps: 3, totalEdits: 2 },
  };
}

function makeBoundaryEliteOutput(): RecruitingLensOutput {
  const output = makeFullEliteOutput();
  output.resumeEdits = Array.from({ length: 8 }, (_, index) => ({
    original: `${index}`.padEnd(240, "o"),
    rewritten: `${index}`.padEnd(280, "r"),
    qualityGates: {
      jdVocab: true,
      achievementTransform: true,
      signalDensity: true,
      jdTargeting: true,
      pasteReady: true,
    },
  }));
  output.linkedinImprovements = Array.from({ length: 6 }, (_, index) => ({
    area: `area-${index}`,
    suggestion: `${index}`.padEnd(280, "s"),
  }));
  output.keywords = {
    matched: Array.from(
      { length: 10 },
      (_, index) => `${index}`.padEnd(80, "m"),
    ),
    missing: Array.from(
      { length: 10 },
      (_, index) => `${index}`.padEnd(80, "x"),
    ),
  };
  output.quickFixes = Array.from(
    { length: 5 },
    (_, index) => `${index}`.padEnd(240, "q"),
  );
  return output;
}

// ── Accept: a fully-merged Elite output validates unchanged ──────────────────

Deno.test("schema: accepts a fully-merged Elite output (ok)", () => {
  const result = recruitingLensOutputSchema.safeParse(makeFullEliteOutput());
  assertEquals(result.success, true);
});

Deno.test("schema: accepts boundary-sized Elite rl-call-3 output unchanged (ok)", () => {
  const boundary = makeBoundaryEliteOutput();
  const result = recruitingLensOutputSchema.safeParse(boundary);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.resumeEdits, boundary.resumeEdits);
    assertEquals(
      result.data.linkedinImprovements,
      boundary.linkedinImprovements,
    );
    assertEquals(result.data.keywords, boundary.keywords);
    assertEquals(result.data.quickFixes, boundary.quickFixes);
  }
});

// ── Accept: the REAL Pro tier-shaped subset validates (D-06 byte-preserve) ───

Deno.test("schema: accepts the Pro tier-shaped subset produced by applyRecruitingLensTierShape (ok)", () => {
  const proShaped = makeFullEliteOutput();
  applyRecruitingLensTierShape(proShaped, "pro"); // strips strategicAdvice/keywords/quickFixes/roadmap/etc, caps topGaps
  const result = recruitingLensOutputSchema.safeParse(proShaped);
  assertEquals(result.success, true);
});

// ── Accept: optional fields absent — present-or-absent both validate ─────────

Deno.test("schema: accepts an Elite body with all tier-shaped-optional fields absent (ok)", () => {
  const minimal = {
    overallMatch: { score: 40, label: "Weak Match", summary: "Needs work." },
    recruiterVerdict: "Not ready.",
    topGaps: [{ title: "Only gap", severity: "high", whyItMatters: "Matters." }],
    // no strategicAdvice, keywords, quickFixes, subScores, preAnalysis, roadmap, resumeEdits, _meta
  };
  const result = recruitingLensOutputSchema.safeParse(minimal);
  assertEquals(result.success, true);
});

// ── Accept: merger-emitted extra fields are passthrough (never dropped) ──────

Deno.test("schema: passes through extra merger-emitted fields (analysisId, metadata) (ok)", () => {
  const withExtras = {
    ...makeFullEliteOutput(),
    analysisId: "00000000-0000-0000-0000-000000000000",
    metadata: { cache_key: "abc", tier: "elite" },
  };
  const result = recruitingLensOutputSchema.safeParse(withExtras);
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals((result.data as Record<string, unknown>).analysisId, "00000000-0000-0000-0000-000000000000");
    assertEquals(
      (result.data as Record<string, unknown>).metadata,
      withExtras.metadata,
    );
  }
});

// ── Reject: genuinely malformed bodies ───────────────────────────────────────

Deno.test("schema: rejects a body missing overallMatch.score", () => {
  const bad = makeFullEliteOutput() as unknown as Record<string, unknown>;
  delete (bad.overallMatch as Record<string, unknown>).score;
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects a body missing recruiterVerdict", () => {
  const bad = makeFullEliteOutput() as unknown as Record<string, unknown>;
  delete bad.recruiterVerdict;
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects a body whose (present) strategicAdvice is missing summary", () => {
  const bad = makeFullEliteOutput() as unknown as Record<string, unknown>;
  bad.strategicAdvice = { applyNow: true, biggestScoreMover: "X" }; // summary omitted
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects an out-of-range overallMatch.score", () => {
  const bad = makeFullEliteOutput() as unknown as Record<string, unknown>;
  (bad.overallMatch as Record<string, unknown>).score = 150;
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects an empty topGaps array", () => {
  const bad = makeFullEliteOutput() as unknown as Record<string, unknown>;
  bad.topGaps = [];
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects resumeEdits one over the 8-item maximum", () => {
  const bad = makeBoundaryEliteOutput();
  bad.resumeEdits.push(bad.resumeEdits[0]);
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects linkedinImprovements one over the 6-item maximum", () => {
  const bad = makeBoundaryEliteOutput();
  bad.linkedinImprovements = [
    ...(bad.linkedinImprovements ?? []),
    { area: "other", suggestion: "One over." },
  ];
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects keywords.matched one over the 10-item maximum", () => {
  const bad = makeBoundaryEliteOutput();
  bad.keywords.matched.push("one-over");
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects keywords.missing one over the 10-item maximum", () => {
  const bad = makeBoundaryEliteOutput();
  bad.keywords.missing.push("one-over");
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects quickFixes one over the 5-item maximum", () => {
  const bad = makeBoundaryEliteOutput();
  bad.quickFixes.push("one-over");
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects resumeEdits.original one over 240 characters", () => {
  const bad = makeBoundaryEliteOutput();
  bad.resumeEdits[0].original = "o".repeat(241);
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects resumeEdits.rewritten one over 280 characters", () => {
  const bad = makeBoundaryEliteOutput();
  bad.resumeEdits[0].rewritten = "r".repeat(281);
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects linkedin suggestion one over 280 characters", () => {
  const bad = makeBoundaryEliteOutput();
  bad.linkedinImprovements![0].suggestion = "s".repeat(281);
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects matched keyword one over 80 characters", () => {
  const bad = makeBoundaryEliteOutput();
  bad.keywords.matched[0] = "m".repeat(81);
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects missing keyword one over 80 characters", () => {
  const bad = makeBoundaryEliteOutput();
  bad.keywords.missing[0] = "x".repeat(81);
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});

Deno.test("schema: rejects quick fix one over 240 characters", () => {
  const bad = makeBoundaryEliteOutput();
  bad.quickFixes[0] = "q".repeat(241);
  assertEquals(recruitingLensOutputSchema.safeParse(bad).success, false);
});
