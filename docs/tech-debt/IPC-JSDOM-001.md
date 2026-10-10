---
id: IPC-JSDOM-001
opened: 2026-04-28
phase_origin: 23-interview-prep-runtime-overhaul
phase_documenting: 25-ux-gap-closure-and-phase-23-cleanup
status: open
severity: low
component: src/pages/InterviewPrep.test.tsx
---

# IPC-JSDOM-001 — InterviewPrep form-submission tests hang under jsdom

## Summary

The 5 planned form-submission click-through tests (Generate Prep → flashcard /
quiz result transitions) hang the Vitest runner under jsdom. The tests were
deliberately not written during Phase 23 (see comment block in
`src/pages/InterviewPrep.test.tsx:4-7` and `:180-183`). Coverage of the same
surface is provided via the edge-function contract tests in
`supabase/functions/interview-prep-analyze/__tests__/`.

## Root cause hypothesis

- `framer-motion` animation hooks await `requestAnimationFrame` cycles that
  jsdom does not drive on its own.
- Possible interaction: `react-hook-form` async resolver + `useReducer`
  dispatching inside an animated `<motion.div>` parent.

## Reproduction

1. Add an `it('Generate Prep submit transitions to flashcard-results', ...)`
   block to `src/pages/InterviewPrep.test.tsx` that fires `userEvent.click` on
   the "Generate Prep" button after `mockTier('pro')`.
2. Run `npm run test -- src/pages/InterviewPrep.test.tsx`.
3. Observe Vitest hang past the 5 s default timeout.

## Candidate fixes

- `vi.mock('framer-motion', ...)` returning plain `<div>` for all motion
  components in a shared `vitest.setup.ts`.
- Stub `requestAnimationFrame` with a synchronous fallback in test setup.
- Migrate the form-submission tests to a real-browser runner (Playwright
  component testing) for this single page.

## Closing criteria

A new commit re-enables the 5 form-submission tests in
`src/pages/InterviewPrep.test.tsx` with all assertions green under
`npm run test`. Update this file's frontmatter to `status: closed` and add a
closing entry under a new `## Closed` section.
