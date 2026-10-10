/**
 * TDD RED: Minimal test for resume prompt tier builders.
 * Verifies that buildFreeResumePrompt, buildProResumePrompt, buildEliteResumePrompt
 * exist and return tier-distinct strings.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";

// Import the new builders (will fail until Task 1 implementation)
import {
  buildFreeResumePrompt,
  buildProResumePrompt,
  buildEliteResumePrompt,
  buildCallSuffix,
  RESUME_PROMPT_VARIANTS,
  type PromptParams,
} from './resume-prompts.ts';

const fixture: PromptParams = {
  isElite: false,
  tier: 'free',
  currentDate: '2026-04-15',
  wordCount: 500,
  bulletCount: 20,
  numberCount: 10,
  hasEducation: true,
  hasSkillsSection: true,
  experienceYears: ['2020-2024'],
  targetRole: 'Software Engineer',
  targetIndustry: 'Tech',
};

Deno.test("buildFreeResumePrompt returns a non-empty string", () => {
  const result = buildFreeResumePrompt({ ...fixture, tier: 'free' });
  assertEquals(typeof result, "string");
  assertEquals(result.length > 0, true);
});

Deno.test("buildFreeResumePrompt contains FREE TIER OUTPUT CONSTRAINT", () => {
  const result = buildFreeResumePrompt({ ...fixture, tier: 'free' });
  assertStringIncludes(result, "FREE TIER OUTPUT CONSTRAINT");
});

Deno.test("buildFreeResumePrompt does NOT contain ELITE ANALYSIS", () => {
  const result = buildFreeResumePrompt({ ...fixture, tier: 'free' });
  assertEquals(result.includes("ELITE ANALYSIS"), false);
});

Deno.test("buildProResumePrompt does NOT contain ELITE ANALYSIS", () => {
  const result = buildProResumePrompt({ ...fixture, tier: 'pro' });
  assertEquals(result.includes("ELITE ANALYSIS"), false);
});

Deno.test("buildEliteResumePrompt contains ELITE ANALYSIS", () => {
  const result = buildEliteResumePrompt({ ...fixture, tier: 'elite', isElite: true });
  assertStringIncludes(result, "ELITE ANALYSIS");
});

Deno.test("Elite summary call does not request eliteInsights or rewriteSuggestions (own calls now)", () => {
  const result = buildCallSuffix('summary', true, 'elite');
  assertEquals(result.includes("eliteInsights"), false);
  assertEquals(result.includes("interviewLikelihood"), false);
  // The rewriteSuggestions JSON field must NOT appear in the summary schema (260608-p5k).
  assertEquals(result.includes('"rewriteSuggestions"'), false);
  assertStringIncludes(result, "executiveSummary");
});

Deno.test("Rewrites call owns rewriteSuggestions and carries the fixture sentinel", () => {
  const result = buildCallSuffix('rewrites', true, 'elite');
  assertStringIncludes(result, '"rewriteSuggestions"');
  // Unique sentinel the AI_TEST_MODE fixture detector keys on (must precede the
  // summary branch, since both prompts contain "Do NOT score any criteria").
  assertStringIncludes(result, "Generate ONLY ready-to-paste resume bullet rewrites");
});

Deno.test("Elite extras call owns eliteInsights", () => {
  const result = buildCallSuffix('elite-extras', true, 'elite');
  assertStringIncludes(result, "eliteInsights");
  assertStringIncludes(result, "interviewLikelihood");
});

Deno.test("RESUME_PROMPT_VARIANTS has free, pro, elite builders", () => {
  assertEquals(typeof RESUME_PROMPT_VARIANTS.free, "function");
  assertEquals(typeof RESUME_PROMPT_VARIANTS.pro, "function");
  assertEquals(typeof RESUME_PROMPT_VARIANTS.elite, "function");
});
