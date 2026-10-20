---
status: complete
completed: 2026-06-07
quick_id: 260607-49g
slug: add-docx-txt-and-md-file-type-support-fo
---

# Quick Summary: Upload File Types and Merit Costs

## Completed

- Added shared resume document support for `.pdf`, `.docx`, `.txt`, and `.md` through `extractDocumentFromFile`.
- Updated resume upload surfaces to use the shared accepted-file contract and user-facing label.
- Kept LinkedIn-specific uploads PDF-only and removed/preserved against paste-mode paths where this task touched them.
- Fixed Profile and Jobs resume uploads so newly accepted non-PDF files are extracted before analysis instead of only being accepted by the picker.
- Aligned frontend merit costs and added the database upsert migration for Resume Analysis, LinkedIn Grader, Career Compass, and Recruiting Lens.
- Updated source-assertion tests for the new extraction facade contract.

## Verification

- PASS: `npm.cmd test -- src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts`
- PASS: `npm.cmd run build`
- BLOCKED: `npm.cmd run type-check` exits before source checking with `tsconfig.app.json(5,27): error TS5103: Invalid value for '--ignoreDeprecations'.`

## Notes

- Generic resume/document uploads now advertise and validate `PDF, DOCX, TXT, or MD`.
- LinkedIn PDF upload handlers validate by shared PDF MIME-or-extension detection so valid PDFs with missing browser MIME type are accepted.
- No commit was created in this run because the workspace already contained in-progress quick-task changes and unrelated untracked phase artifacts.
