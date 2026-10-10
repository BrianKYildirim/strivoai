import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  detectMissingEliteSections,
  mergeEliteUnlockPatch,
  type EliteUnlockPatch,
  validateEliteUnlockPatch,
} from "./resume-elite-unlock.ts";
import {
  buildEliteUnlockDetailsPrompt,
  buildEliteUnlockExtrasPrompt,
  ELITE_UNLOCK_DETAILS_CALL_NAME,
  ELITE_UNLOCK_EXTRAS_CALL_NAME,
} from "./resume-prompts.ts";

function assertStructuredOutputWireSchema(value: unknown, path = "root"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertStructuredOutputWireSchema(entry, `${path}[${index}]`)
    );
    return;
  }
  if (value === null || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const unsupported = [
    "minimum",
    "maximum",
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "minProperties",
    "maxProperties",
  ];
  for (const keyword of unsupported) {
    assertEquals(record[keyword], undefined, `${path}.${keyword} is not wire-compatible`);
  }
  if (record.type === "object") {
    assertEquals(
      record.additionalProperties,
      false,
      `${path}.additionalProperties must be false`,
    );
  }
  for (const [key, nested] of Object.entries(record)) {
    assertStructuredOutputWireSchema(nested, `${path}.${key}`);
  }
}

function makeStoredFreeResult(): Record<string, unknown> {
  return {
    overallScore: 67,
    executiveSummary: {
      keyStrengths: ["Strong TypeScript delivery"],
      keyGaps: ["Few quantified outcomes"],
      highImpactFix: "Add measurable results",
    },
    resumeSignal: "Product-minded frontend engineer",
    strengths: ["Clear progression", "Relevant projects"],
    priorityImprovements: ["Quantify the checkout redesign"],
    criterionFeedback: [
      {
        id: "c1_visual_clarity",
        label: "Visual Clarity & Layout",
        weight: 6,
        score: 70,
      },
      {
        id: "c6_achievement_orientation",
        label: "Achievement Orientation & Quantified Impact",
        weight: 20,
        score: 64,
        feedback: {
          observation: "The strongest bullets name outcomes.",
          impact: "Measured outcomes improve recruiter confidence.",
          fix: "Quantify the remaining project bullets.",
        },
      },
    ],
    rewriteSuggestions: [{
      criterionId: "c6_achievement_orientation",
      title: "Quantify delivery",
      originalText: "Built a checkout flow",
      issues: ["No measurable result"],
      improvedText: "Built a checkout flow that reduced abandonment by 18%.",
      impact: "Shows business impact",
      potentialScoreIncrease: 4,
    }],
  };
}

function makeCompletePatch(): EliteUnlockPatch {
  return {
    criterionFeedback: [{
      id: "c1_visual_clarity",
      feedback: {
        observation: "The section hierarchy is clear.",
        impact: "Recruiters can scan the page quickly.",
        fix: "Increase whitespace above Experience.",
      },
    }],
    priorityImprovements: [
      "Add a metric to the platform migration bullet.",
      "Move core technologies into the first third.",
      "Shorten the oldest role.",
      "Clarify ownership of the redesign.",
      "Add the scale of the user base.",
      "Name the deployment outcome.",
    ],
    rewriteSuggestions: Array.from({ length: 9 }, (_, index) => ({
      criterionId: "c6_achievement_orientation",
      title: `Impact rewrite ${index + 1}`,
      originalText: `Original bullet ${index + 1}`,
      issues: ["Missing outcome"],
      improvedText: `Improved bullet ${index + 1} with a measurable outcome.`,
      impact: "Makes the result explicit",
      potentialScoreIncrease: 2,
    })),
    industryGuess: "Software Engineering",
    suggestedTargetRoles: ["Frontend Engineer", "Product Engineer"],
    recommendedKeywords: ["TypeScript", "React", "Accessibility"],
    eliteInsights: {
      interviewLikelihood: 74,
      interviewLikelihoodExplanation: "The resume is credible but needs more quantified impact.",
      competitiveRanking: "Top 25%",
      recruiterFirstImpressions: {
        atThreeSeconds: "Clear frontend specialization.",
        atSevenSeconds: "Strong product delivery.",
        whatTheyMiss: "The scale of the work.",
      },
      hiddenWeaknesses: ["Ownership scope is sometimes unclear."],
      powerPhrases: ["reduced abandonment by 18%"],
      detailedATSGapAnalysis: [{
        keyword: "accessibility",
        priority: "high",
        suggestedPlacement: "Skills section",
      }],
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

Deno.test("AC-01 preserves every stored Free-owned value and existing paid value", () => {
  const base = makeStoredFreeResult();
  base.industryGuess = "Existing paid industry";
  const frozenProjection = clone(base);
  const missing = detectMissingEliteSections(base);
  const patch = makeCompletePatch();
  delete patch.industryGuess;

  const result = mergeEliteUnlockPatch(base, missing, patch);
  assert(result.ok, result.ok ? undefined : result.error);

  assertEquals(base, frozenProjection);
  assertEquals(result.data.overallScore, frozenProjection.overallScore);
  assertEquals(result.data.executiveSummary, frozenProjection.executiveSummary);
  assertEquals(result.data.resumeSignal, frozenProjection.resumeSignal);
  assertEquals(result.data.strengths, frozenProjection.strengths);
  assertEquals(
    (result.data.priorityImprovements as unknown[]).slice(0, 1),
    frozenProjection.priorityImprovements,
  );
  assertEquals(
    (result.data.rewriteSuggestions as unknown[]).slice(0, 1),
    frozenProjection.rewriteSuggestions,
  );
  const mergedCriteria = result.data.criterionFeedback as Record<string, unknown>[];
  const baseCriteria = frozenProjection.criterionFeedback as Record<string, unknown>[];
  for (let index = 0; index < baseCriteria.length; index += 1) {
    assertEquals(mergedCriteria[index].id, baseCriteria[index].id);
    assertEquals(mergedCriteria[index].label, baseCriteria[index].label);
    assertEquals(mergedCriteria[index].weight, baseCriteria[index].weight);
    assertEquals(mergedCriteria[index].score, baseCriteria[index].score);
    if (baseCriteria[index].feedback !== undefined) {
      assertEquals(mergedCriteria[index].feedback, baseCriteria[index].feedback);
    }
  }
  assertEquals(result.data.industryGuess, "Existing paid industry");
});

Deno.test("AC-02 detects complete, partial, and already-complete missing sets", () => {
  const base = makeStoredFreeResult();
  const completeMissing = detectMissingEliteSections(base);
  assert(completeMissing.includes("criterionFeedback.c1_visual_clarity.feedback"));
  assert(completeMissing.includes("priorityImprovements"));
  assert(completeMissing.includes("rewriteSuggestions"));
  assert(completeMissing.includes("industryGuess"));
  assert(completeMissing.includes("suggestedTargetRoles"));
  assert(completeMissing.includes("recommendedKeywords"));
  assert(completeMissing.includes("eliteInsights"));

  const partial = clone(base);
  partial.industryGuess = "Software Engineering";
  partial.suggestedTargetRoles = ["Frontend Engineer"];
  const partialMissing = detectMissingEliteSections(partial);
  assertEquals(partialMissing.includes("industryGuess"), false);
  assertEquals(partialMissing.includes("suggestedTargetRoles"), false);
  assert(partialMissing.includes("recommendedKeywords"));

  const merged = mergeEliteUnlockPatch(base, completeMissing, makeCompletePatch());
  assert(merged.ok, merged.ok ? undefined : merged.error);
  assertEquals(detectMissingEliteSections(merged.data), []);
});

Deno.test("T-04-03 rejects protected and unrequested paths", () => {
  const base = makeStoredFreeResult();
  const missing = detectMissingEliteSections(base);
  for (const protectedPatch of [
    { overallScore: 99 },
    { executiveSummary: { highImpactFix: "Replace the stored summary" } },
    { strengths: ["Replace the stored strengths"] },
    {
      criterionFeedback: [{
        id: "c1_visual_clarity",
        score: 99,
        feedback: {
          observation: "Observation.",
          impact: "Impact.",
          fix: "Fix.",
        },
      }],
    },
    { priorityImprovements: ["Replace existing entry"], replace: true },
  ]) {
    const result = validateEliteUnlockPatch(
      base,
      missing,
      protectedPatch as EliteUnlockPatch,
    );
    assertEquals(result.ok, false);
  }

  const unrequested = validateEliteUnlockPatch(
    { ...base, industryGuess: "Existing" },
    detectMissingEliteSections({ ...base, industryGuess: "Existing" }),
    { industryGuess: "Overwrite" },
  );
  assertEquals(unrequested.ok, false);
  if (!unrequested.ok) assertStringIncludes(unrequested.error, "industryGuess");
});

Deno.test("AC-02 rejects malformed section values without echoing content", () => {
  const base = makeStoredFreeResult();
  const missing = detectMissingEliteSections(base);
  const secret = "PRIVATE RESUME CONTENT";
  const result = validateEliteUnlockPatch(base, missing, {
    criterionFeedback: [{
      id: "c1_visual_clarity",
      feedback: { observation: secret, impact: "", fix: "" },
    }],
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertStringIncludes(result.error, "criterionFeedback");
    assertEquals(result.error.includes(secret), false);
  }
});

Deno.test("AC-01 empty-set merge is a no-op and duplicate application is idempotent", () => {
  const base = makeStoredFreeResult();
  const missing = detectMissingEliteSections(base);
  const patch = makeCompletePatch();
  const first = mergeEliteUnlockPatch(base, missing, patch);
  assert(first.ok, first.ok ? undefined : first.error);

  const complete = clone(first.data);
  assertEquals(detectMissingEliteSections(complete), []);
  const noOp = mergeEliteUnlockPatch(complete, [], {});
  assert(noOp.ok, noOp.ok ? undefined : noOp.error);
  assertEquals(noOp.data, complete);

  const duplicate = mergeEliteUnlockPatch(first.data, missing, patch);
  assert(duplicate.ok, duplicate.ok ? undefined : duplicate.error);
  assertEquals(duplicate.data, first.data);
});

Deno.test("AC-02 prompt schemas include only requested Elite delta sections", () => {
  const details = buildEliteUnlockDetailsPrompt({
    sanitizedResumeText: "Sanitized resume text",
    missingSections: [
      "criterionFeedback.c1_visual_clarity.feedback",
      "recommendedKeywords",
    ],
    storedResult: makeStoredFreeResult(),
  });
  assert(details);
  assertEquals(details.callName, ELITE_UNLOCK_DETAILS_CALL_NAME);
  assertEquals(details.callName, "elite-unlock-details");
  const schema = details.outputSchema as {
    properties: Record<string, unknown>;
  };
  assertEquals(Object.keys(schema.properties).sort(), [
    "criterionFeedback",
    "recommendedKeywords",
  ]);
  assertEquals(details.systemPrompt.includes("overallScore"), false);
});

Deno.test("AC-02 completed extras are represented as zero calls", () => {
  const base = makeStoredFreeResult();
  const noExtras = buildEliteUnlockExtrasPrompt({
    sanitizedResumeText: "Sanitized resume text",
    missingSections: ["industryGuess"],
    storedResult: base,
  });
  assertEquals(noExtras, null);

  const extras = buildEliteUnlockExtrasPrompt({
    sanitizedResumeText: "Sanitized resume text",
    missingSections: ["eliteInsights"],
    storedResult: base,
  });
  assert(extras);
  assertEquals(extras.callName, ELITE_UNLOCK_EXTRAS_CALL_NAME);
  assertEquals(extras.callName, "elite-unlock-extras");
  assertEquals(
    Object.keys(
      (extras.outputSchema as { properties: Record<string, unknown> }).properties,
    ),
    ["eliteInsights"],
  );
});

Deno.test("AC-02 raw Anthropic schemas use only supported structured-output constraints", () => {
  const base = makeStoredFreeResult();
  const details = buildEliteUnlockDetailsPrompt({
    sanitizedResumeText: "Sanitized resume text",
    missingSections: detectMissingEliteSections(base).filter((section) =>
      section !== "eliteInsights"
    ),
    storedResult: base,
  });
  const extras = buildEliteUnlockExtrasPrompt({
    sanitizedResumeText: "Sanitized resume text",
    missingSections: ["eliteInsights"],
    storedResult: base,
  });
  assert(details);
  assert(extras);
  assertStructuredOutputWireSchema(details.outputSchema, "details");
  assertStructuredOutputWireSchema(extras.outputSchema, "extras");
});
