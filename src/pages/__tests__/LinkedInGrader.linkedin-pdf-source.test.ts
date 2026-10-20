import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Normalize CRLF→LF so newline-sensitive assertions match on any checkout (Windows vs LF).
const source = readFileSync(resolve("src/pages/LinkedInGrader.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("LinkedInGrader linkedin PDF source contract", () => {
  it("uses only persisted LinkedIn PDF fields as the saved initial document source", () => {
    expect(source).toContain(
      ".select('subscription_tier, linkedin_pdf_content, linkedin_pdf_filename')",
    );
    expect(source).toContain('setPersistedLinkedInPdf({');
    expect(source).toContain('content: profile.linkedin_pdf_content');
    expect(source).toContain("filename: profile.linkedin_pdf_filename || 'LinkedIn profile.pdf'");
    expect(source).toContain('contentToAnalyze = persistedLinkedInPdf!.content');
    expect(source).toContain('const canSubmit = !!file || !!persistedLinkedInPdf');
    expect(source).not.toContain(".select('subscription_tier, resume");
  });

  // A replacement remains durable only after the grade succeeds; selecting a local file
  // must not overwrite the onboarding source before that point.
  it("persists replacement PDF source only after successful grade handling", () => {
    const invokeIndex = source.indexOf("invokeWithTimeout<LinkedInGradeResponse>");
    const persistIndex = source.indexOf("linkedin_pdf_content: replacementLinkedInPdf.content");
    expect(invokeIndex).toBeGreaterThan(-1);
    // The replacement PDF is only written into the update payload after the grade call returns.
    expect(persistIndex).toBeGreaterThan(invokeIndex);
    expect(source).toContain(".update(updatePayload)");
    expect(source).toContain("console.warn('[LinkedInGrader] linkedin_pdf replacement UPDATE failed'");
  });
});
