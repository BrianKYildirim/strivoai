import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve("src/pages/RecruitingLens.tsx"), "utf8");
const modalSource = readFileSync(resolve("src/components/RecruitingLensTutorialModal.tsx"), "utf8");

describe("RecruitingLens applications and tutorial contract", () => {
  it("requires company, role, job description, and resume context before submission", () => {
    expect(pageSource).toContain("Company name");
    expect(pageSource).toContain("Role title");
    expect(pageSource).toContain("Job Description");
    expect(pageSource).toContain("const isFormReady =");
    expect(pageSource).toContain("!!companyName.trim()");
    expect(pageSource).toContain("!!roleTitle.trim()");
    expect(pageSource).toContain("!!jobDescription.trim()");
    expect(pageSource).toContain("disabled={!isFormReady");
    expect(pageSource).toContain("company: companyName.trim()");
    expect(pageSource).toContain("roleTitle: roleTitle.trim()");
  });

  it("opens the tutorial from the first submit flow and persists dismissal", () => {
    expect(pageSource).toContain("TUTORIAL_STORAGE_KEY");
    expect(pageSource).toContain("recruiting-lens-tutorial-dismissed");
    expect(pageSource).toContain("if (!hasDismissedTutorial)");
    expect(pageSource).toContain("setPendingTutorialSubmit(true)");
    expect(pageSource).toContain("setShowTutorial(true)");
    expect(pageSource).toContain("const [showTutorial, setShowTutorial] = useState(false)");
    expect(pageSource).toContain("View tutorial");
    expect(modalSource).toContain("How Recruiting Lens uses your job details");
    expect(modalSource).toContain("Start job analysis");
    expect(modalSource).toContain("Skip tutorial");
  });

  it("renders saved work below the form and hydrates existing deep links", () => {
    const gridIndex = pageSource.indexOf("grid grid-cols-1 md:grid-cols-[3fr_2fr]");
    const savedIndex = pageSource.indexOf("Saved analyses");
    expect(gridIndex).toBeGreaterThan(-1);
    expect(savedIndex).toBeGreaterThan(gridIndex);
    expect(pageSource).toContain(".from('applications')");
    expect(pageSource).toContain("Saved job match reports will appear after you analyze a company, role, and job description.");
    expect(pageSource).toContain("setSearchParams({ id: job.jd_id })");
    expect(pageSource).toContain("Open ${job.company_applied} ${job.role_applied} match report");
  });
});
