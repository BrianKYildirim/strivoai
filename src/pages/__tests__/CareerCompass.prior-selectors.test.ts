import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("src/pages/CareerCompass.tsx"), "utf8");

describe("CareerCompass prior selector contract", () => {
  it("mounts resume and LinkedIn selectors while preserving saved prior state", () => {
    expect(source).toContain("PriorAnalysisSelector");
    expect(source).toContain("PriorLinkedInSelector");
    expect(source).toContain("setSavedResumeFilePath(prior.filePath)");
    expect(source).toContain("setSavedLinkedinContent(source.content)");
    expect(source).toContain("linkedin_pdf_content");
  });

  it("keeps the existing missing LinkedIn prior fallback and /upload resume CTA", () => {
    expect(source).toContain("linkedin_prior_missing");
    expect(source).toContain("ctaHref=\"/upload\"");
    expect(source).toContain("ctaHref=\"/linkedin-grader\"");
  });
});

