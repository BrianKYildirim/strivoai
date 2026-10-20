import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/pages/InterviewPrep.tsx"), "utf8");

describe("InterviewPrep prior selector contract", () => {
  it("mounts the resume selector and transitions to input-form when a prior is selected", () => {
    expect(source).toContain("PriorAnalysisSelector");
    expect(source).toContain("resume-selected");
    expect(source).toContain("status: state.tier === \"free\" ? \"free-gate\" : \"input-form\"");
  });

  it("uses the shared no-resume CTA without touching production feature gate code", () => {
    expect(source).toContain("Analyze a resume first to start Interview Prep.");
    expect(source).toContain("ctaHref=\"/upload\"");
    expect(source).not.toContain("VITE_FEATURE_INTERVIEW_PREP");
  });
});

