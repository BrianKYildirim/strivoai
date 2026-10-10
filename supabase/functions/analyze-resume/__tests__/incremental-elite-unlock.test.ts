import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  baseResumeResultsMatch,
  detectMissingEliteSections,
  mergeEliteUnlockPatch,
} from "../../_shared/resume-elite-unlock.ts";

const indexSource = await Deno.readTextFile(
  new URL("../index.ts", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
);

const fixture = {
  overallScore: 72,
  criterionFeedback: [
    { id: "impact", label: "Impact", score: 70, feedback: null },
    { id: "clarity", label: "Clarity", score: 74, feedback: { observation: "Clear", impact: "Readable", fix: "Keep it" } },
  ],
  strengths: ["Clear experience"],
  priorityImprovements: ["Add metrics"],
  rewriteSuggestions: [],
  industryGuess: "",
  suggestedTargetRoles: [],
  recommendedKeywords: [],
  eliteInsights: null,
};

Deno.test("AC-02: elite_unlock dispatch occurs before normal full-analysis prompt construction", () => {
  const branch = indexSource.indexOf("rawBody.mode === 'elite_unlock'");
  const fullPrompt = indexSource.indexOf("buildResumePromptContext({", branch);
  assert(branch >= 0, "controller must discriminate elite_unlock");
  assert(fullPrompt > branch, "incremental branch must run before full-analysis prompt construction");
  assert(indexSource.includes("buildEliteUnlockDetailsPrompt"));
  assert(indexSource.includes("buildEliteUnlockExtrasPrompt"));
});

Deno.test("AC-04: completed durable replay returns before merit reservation or Anthropic", () => {
  assert(indexSource.includes("elite-unlock-completed-replay"));
  assert(indexSource.includes("replayed: true"));
  assert(indexSource.includes("zero_provider_calls: true"));
});

Deno.test("AC-05: only resumeId and optional baseAnalysisId are accepted client identifiers", () => {
  assert(indexSource.includes("UNLOCK_FORBIDDEN_CLIENT_FIELDS"));
  for (const field of ["tier", "userId", "resumeText", "gradingData", "fileName", "filename"]) {
    assert(indexSource.includes(`'${field}'`) || indexSource.includes(`"${field}"`), `missing spoof guard for ${field}`);
  }
  assert(indexSource.includes(".eq('user_id', ownerId)"), "resume and mirror reads must be owner scoped");
  assert(indexSource.includes("resolvedTier !== 'elite'"), "current Elite access must be server resolved");
  assert(indexSource.includes("analyzed_tier !== 'free'"), "original Free tier must be verified");
  assert(indexSource.includes("extracted_text"));
  assert(indexSource.includes("file_hash"));
  assert(indexSource.includes("text_hash"));
  assert(indexSource.includes("document_hash"));
  assert(indexSource.includes("source_reference"));
});

Deno.test("AC-05: missing-section selection is deterministic for details plus extras", () => {
  const missing = detectMissingEliteSections(fixture);
  assert(missing.includes("criterionFeedback.impact.feedback"));
  assert(missing.includes("priorityImprovements"));
  assert(missing.includes("rewriteSuggestions"));
  assert(missing.includes("eliteInsights"));
});

Deno.test("AC-05: Free base identity ignores metadata and Zod/jsonb key ordering", () => {
  const zodOrdered = {
    overallScore: 72,
    strengths: ["Clear experience"],
    criterionFeedback: [{ id: "impact", score: 70 }],
    metadata: { clientOnly: true },
  };
  const jsonbOrdered = {
    strengths: ["Clear experience"],
    criterionFeedback: [{ score: 70, id: "impact" }],
    overallScore: 72,
    metadata: { tier: "free", analysisDate: "2026-07-31T00:00:00.000Z" },
  };

  assert(baseResumeResultsMatch(zodOrdered, jsonbOrdered));
  assertEquals(
    baseResumeResultsMatch(zodOrdered, { ...jsonbOrdered, overallScore: 73 }),
    false,
  );
});

Deno.test("AC-06: distinct telemetry call names and token-aware provider seam are wired", () => {
  assert(indexSource.includes("buildEliteUnlockDetailsPrompt"));
  assert(indexSource.includes("buildEliteUnlockExtrasPrompt"));
  assert(indexSource.includes("callName: prompt.callName"));
  assert(indexSource.includes("telemetry:"));
  assert(indexSource.includes("persist_resume_elite_unlock"));
  assert(indexSource.includes("usage_id"));
});

Deno.test("AC-07: patch/full-result validation precedes the single atomic persistence call", () => {
  const controllerMergeStart = indexSource.indexOf("const combinedPatch");
  const patchValidation = indexSource.indexOf("validateEliteUnlockPatch(", controllerMergeStart);
  const merge = indexSource.indexOf("mergeEliteUnlockPatch(", patchValidation);
  const fullValidation = indexSource.indexOf("resumeAnalysisSchema.safeParse(", merge);
  const persist = indexSource.indexOf("persist_resume_elite_unlock", fullValidation);
  assert(patchValidation >= 0 && merge > patchValidation && fullValidation > merge && persist > fullValidation);
  assertEquals((indexSource.match(/rpc\('persist_resume_elite_unlock'/g) ?? []).length, 1);
  assert(indexSource.includes("refundMeritsForJob"));
});

Deno.test("AC-07: immutable merge preserves Free-owned score and strengths", () => {
  const missing = detectMissingEliteSections(fixture);
  const merged = mergeEliteUnlockPatch(fixture, missing, {
    criterionFeedback: [{ id: "impact", feedback: { observation: "Needs proof", impact: "Lower trust", fix: "Add metrics" } }],
    priorityImprovements: ["Quantify outcomes"],
    rewriteSuggestions: [{
      criterionId: "impact",
      title: "Quantify impact",
      originalText: "Led projects",
      issues: ["No metric"],
      improvedText: "Led 3 projects, cutting cycle time 20%",
      impact: "Shows scale",
      potentialScoreIncrease: 4,
    }],
    industryGuess: "Technology",
    suggestedTargetRoles: ["Product Manager"],
    recommendedKeywords: ["roadmap"],
    eliteInsights: { positioning: "Operator" },
  });
  assert(merged.ok);
  assertEquals(merged.data.overallScore, fixture.overallScore);
  assertEquals(merged.data.strengths, fixture.strengths);
});

Deno.test("AC-08: identity conflicts use the existing fresh full-analysis contract", () => {
  assert(indexSource.includes("fresh_analysis_required"));
  assert(indexSource.includes("This resume has changed, so it needs a new full analysis."));
  assert(indexSource.includes("stored_text_unavailable"));
});

Deno.test("AC-09: sync and queue recovery share a stable content identity", () => {
  assert(indexSource.includes("generation_mode: 'elite_unlock'"));
  assert(indexSource.includes("create_or_recover_analysis_run"));
  assert(indexSource.includes("baseFingerprint"));
  assert(indexSource.includes("idempotencyKey"));
  assert(indexSource.includes("recovered"));
});
