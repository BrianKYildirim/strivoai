/**
 * Deno unit tests for resume prompt tier-variant divergence.
 * Validates that the three resume prompt builders (free/pro/elite) produce
 * structurally distinct outputs and integrate correctly with the tier-prompts
 * loader (GATE-01 compliance).
 *
 * Run with: deno test _shared/resume-prompts-variants.test.ts --no-check --allow-all
 */
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// Import tier-prompts loader
import { loadPromptVariant } from "./tier-prompts.ts";

// Import resume-prompts for side-effect registration + type
import type { PromptParams } from "./resume-prompts.ts";
// Side-effect import: registers 'resume' in the loader
import "./resume-prompts.ts";

// Import global AI principles for GATE-04 assertions
import { STRIVO_GLOBAL_AI_PRINCIPLES } from "./global-ai-principles.ts";

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

const fixtureParams: PromptParams = {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("GATE-01: resume is registered in loader after import", () => {
  const result = loadPromptVariant('resume', 'free', { ...fixtureParams, tier: 'free' });
  assertEquals(typeof result, "string");
  assertEquals(result.length > 0, true, "Free variant should be a non-empty string");
});

Deno.test("GATE-01/RES-01: Free variant contains 'FREE TIER OUTPUT CONSTRAINT'", () => {
  const result = loadPromptVariant('resume', 'free', { ...fixtureParams, tier: 'free' });
  assertStringIncludes(result, "FREE TIER OUTPUT CONSTRAINT");
});

Deno.test("GATE-01/RES-02: Free variant does NOT contain 'ELITE ANALYSIS'", () => {
  const result = loadPromptVariant('resume', 'free', { ...fixtureParams, tier: 'free' });
  assertEquals(
    result.includes("ELITE ANALYSIS"),
    false,
    "Free variant must not contain ELITE ANALYSIS block",
  );
});

Deno.test("GATE-01/RES-03: Pro variant does NOT contain 'FREE TIER OUTPUT CONSTRAINT'", () => {
  const result = loadPromptVariant('resume', 'pro', { ...fixtureParams, tier: 'pro' });
  assertEquals(
    result.includes("FREE TIER OUTPUT CONSTRAINT"),
    false,
    "Pro variant must not contain FREE TIER OUTPUT CONSTRAINT",
  );
});

Deno.test("GATE-01/RES-03: Pro variant does NOT contain 'ELITE ANALYSIS'", () => {
  const result = loadPromptVariant('resume', 'pro', { ...fixtureParams, tier: 'pro' });
  assertEquals(
    result.includes("ELITE ANALYSIS"),
    false,
    "Pro variant must not contain ELITE ANALYSIS block",
  );
});

Deno.test("GATE-01/RES-04: Elite variant contains 'ELITE ANALYSIS'", () => {
  const result = loadPromptVariant('resume', 'elite', { ...fixtureParams, tier: 'elite', isElite: true });
  assertStringIncludes(result, "ELITE ANALYSIS");
});

Deno.test("GATE-04: Pro output begins with STRIVO_GLOBAL_AI_PRINCIPLES first 50 chars", () => {
  const result = loadPromptVariant('resume', 'pro', { ...fixtureParams, tier: 'pro' });
  const principlesPrefix = STRIVO_GLOBAL_AI_PRINCIPLES.slice(0, 50);
  assertEquals(
    result.startsWith(principlesPrefix),
    true,
    `Pro output must start with first 50 chars of STRIVO_GLOBAL_AI_PRINCIPLES. Got: "${result.slice(0, 60)}"`,
  );
});

Deno.test("GATE-04: Free output does NOT begin with STRIVO_GLOBAL_AI_PRINCIPLES", () => {
  const result = loadPromptVariant('resume', 'free', { ...fixtureParams, tier: 'free' });
  const principlesPrefix = STRIVO_GLOBAL_AI_PRINCIPLES.slice(0, 50);
  assertEquals(
    result.startsWith(principlesPrefix),
    false,
    "Free output must NOT start with STRIVO_GLOBAL_AI_PRINCIPLES (cost ceiling enforcement)",
  );
});
