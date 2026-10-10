/**
 * Unit tests for the Phase 01.1 document-limit re-export bridge.
 * Run with: deno test _shared/document-limits.test.ts --no-check --allow-env --allow-net --allow-read
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MAX_PAGES,
  MSG_JD_TOO_LONG,
  MSG_PAGE_LIMIT,
  MSG_UNSUPPORTED_TYPE,
  MSG_VALIDATION_UNAVAILABLE,
  RECRUITING_LENS_JD_MAX_CHARS,
  RECRUITING_LENS_JD_WARN_CHARS,
} from "./document-limits.ts";

Deno.test("document limits: locked messages are byte-exact", () => {
  assertEquals(
    MSG_PAGE_LIMIT,
    "Your document is longer than the 2-page limit. Please upload a PDF or DOCX file containing no more than 2 pages.",
  );
  assertEquals(
    MSG_UNSUPPORTED_TYPE,
    "Unsupported file type. Please upload a PDF or DOCX file.",
  );
  assertEquals(
    MSG_VALIDATION_UNAVAILABLE,
    "We couldn't validate this document. Please try again or upload a different PDF or DOCX file.",
  );
  assertEquals(
    MSG_JD_TOO_LONG,
    "Job descriptions may contain up to 6,000 characters.",
  );
});

Deno.test("document limits: resume and LinkedIn page caps remain distinct", () => {
  assertEquals(MAX_PAGES.resume, 2);
  assertEquals(MAX_PAGES.linkedin_profile, 12);
  assertEquals(MSG_PAGE_LIMIT.includes(String(MAX_PAGES.resume)), true);
});

Deno.test("document limits: Recruiting Lens warning derives from maximum", () => {
  assertEquals(RECRUITING_LENS_JD_MAX_CHARS, 6000);
  assertEquals(RECRUITING_LENS_JD_WARN_CHARS, 5400);
  assertEquals(MSG_JD_TOO_LONG.includes("6,000"), true);
});
