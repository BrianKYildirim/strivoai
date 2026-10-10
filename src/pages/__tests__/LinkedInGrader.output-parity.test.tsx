import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/pages/LinkedInGrader.tsx"), "utf8");

describe("LinkedInGrader output parity", () => {
  it("does not render the legacy What's Working For You/profileInsights section", () => {
    expect(source).not.toContain("What's Working For You");
    expect(source).not.toContain("result.profileInsights &&");
    expect(source).not.toContain("result.profileInsights.map");
  });

  it("keeps legacy profileInsights harmless for comparison data only", () => {
    expect(source).toContain("profileInsights?: string[]");
    expect(source).toContain("profileInsights: result.profileInsights ?? []");
  });

  it("keeps Key Strengths visible in the result surface", () => {
    expect(source).toContain("Your Key Strengths");
    expect(source).toContain("result.keyStrengths?.length > 0");
  });

  it("shows the FULL Ready-to-Paste fix list to Free (D-05) with no locked placeholders", () => {
    // D-05 everything-to-everyone: Free sees the same complete fix list as Elite; the
    // one-real-fix + four-locked-placeholders teaser was removed in 04-05.
    expect(source).not.toContain("LOCKED_FIXES_PLACEHOLDERS");
    expect(source).not.toContain("isFreeGated ? 1");
    expect(source).toContain("result.topFixes.map");
  });

  it("renders all backend-supplied Ready-to-Paste fixes to all tiers with no free slice gate", () => {
    expect(source).not.toContain("LOCKED_FIXES_PLACEHOLDERS");
    expect(source).not.toContain("isFreeGated ? 1");
    expect(source).toContain("result.topFixes.map");
  });
});
