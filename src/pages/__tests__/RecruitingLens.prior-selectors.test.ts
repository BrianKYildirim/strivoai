import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/pages/RecruitingLens.tsx"), "utf8");

describe("RecruitingLens prior selector contract", () => {
  it("renders both prior selectors and feeds selected resume grading data into resumeSummary", () => {
    expect(source).toContain("PriorAnalysisSelector");
    expect(source).toContain("PriorLinkedInSelector");
    expect(source).toContain("setResumeSummary(buildResumeSummary(prior.gradingData))");
  });

  it("keeps LinkedIn optional and routes empty states to the correct pages", () => {
    expect(source).toContain("ctaHref=\"/upload\"");
    expect(source).toContain("ctaHref=\"/linkedin-grader\"");
    expect(source).toContain("linkedinText: linkedinText.trim() || undefined");
    // Submit gating is derived through `isFormReady`, which still requires an
    // analyzed resume + non-empty job description (LinkedIn stays optional).
    expect(source).toContain("hasAnalyzedResume &&");
    expect(source).toContain("!!jobDescription.trim()");
    expect(source).toContain("disabled={!isFormReady");
  });
});

