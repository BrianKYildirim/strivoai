/**
 * Deno unit tests for tier-prompts loader.
 * Run with: deno test supabase/functions/_shared/tier-prompts.test.ts --no-check
 */
import {
  assertEquals,
  assertThrows,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  loadPromptVariant,
  registerFeaturePrompts,
  FEATURE_BUILDERS,
} from "./tier-prompts.ts";
import type { PromptVariantBuilder } from "./tier-prompts.ts";
import {
  STRIVO_GLOBAL_AI_PRINCIPLES,
} from "./global-ai-principles.ts";

// Stub builder for tests
const stubBuilder: PromptVariantBuilder<Record<string, never>> = {
  free: () => "FREE_BODY",
  pro: () => "PRO_BODY",
  elite: () => "ELITE_BODY",
};

Deno.test("loadPromptVariant throws when feature is not registered", () => {
  // Clear any prior registrations for a clean slate
  // deno-lint-ignore no-explicit-any
  delete (FEATURE_BUILDERS as any)["resume"];
  assertThrows(
    () => loadPromptVariant("resume", "free", {}),
    Error,
    "not registered",
  );
});

Deno.test("after registration, free variant returns builder output without principles prefix", () => {
  registerFeaturePrompts("resume", stubBuilder);
  const result = loadPromptVariant("resume", "free", {});
  assertEquals(result, "FREE_BODY");
});

Deno.test("after registration, pro variant is prefixed with STRIVO_GLOBAL_AI_PRINCIPLES", () => {
  registerFeaturePrompts("resume", stubBuilder);
  const result = loadPromptVariant("resume", "pro", {});
  assertStringIncludes(result, STRIVO_GLOBAL_AI_PRINCIPLES);
  assertStringIncludes(result, "PRO_BODY");
  assertEquals(result, `${STRIVO_GLOBAL_AI_PRINCIPLES}\n\n${"PRO_BODY"}`);
});

Deno.test("after registration, elite variant is prefixed with STRIVO_GLOBAL_AI_PRINCIPLES", () => {
  registerFeaturePrompts("resume", stubBuilder);
  const result = loadPromptVariant("resume", "elite", {});
  assertStringIncludes(result, STRIVO_GLOBAL_AI_PRINCIPLES);
  assertStringIncludes(result, "ELITE_BODY");
  assertEquals(result, `${STRIVO_GLOBAL_AI_PRINCIPLES}\n\n${"ELITE_BODY"}`);
});

Deno.test("free variant does NOT contain principles text", () => {
  registerFeaturePrompts("resume", stubBuilder);
  const result = loadPromptVariant("resume", "free", {});
  const principlesSlice = STRIVO_GLOBAL_AI_PRINCIPLES.slice(0, 100);
  assertEquals(result.includes(principlesSlice), false);
});

Deno.test("registering a feature makes all 3 tiers loadable", () => {
  // deno-lint-ignore no-explicit-any
  delete (FEATURE_BUILDERS as any)["resume"];
  registerFeaturePrompts("resume", stubBuilder);
  const free = loadPromptVariant("resume", "free", {});
  const pro = loadPromptVariant("resume", "pro", {});
  const elite = loadPromptVariant("resume", "elite", {});
  assertEquals(typeof free, "string");
  assertEquals(typeof pro, "string");
  assertEquals(typeof elite, "string");
  assertEquals(free.length > 0, true);
  assertEquals(pro.length > 0, true);
  assertEquals(elite.length > 0, true);
});

Deno.test("re-registering a feature overwrites the builder", () => {
  registerFeaturePrompts("resume", stubBuilder);
  const replacement: PromptVariantBuilder<Record<string, never>> = {
    free: () => "NEW_FREE",
    pro: () => "NEW_PRO",
    elite: () => "NEW_ELITE",
  };
  registerFeaturePrompts("resume", replacement);
  const result = loadPromptVariant("resume", "free", {});
  assertEquals(result, "NEW_FREE");
});
