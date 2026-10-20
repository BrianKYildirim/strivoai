# Phase 33 — Deferred Items

## Pre-existing lint errors in src/pages/Dashboard.tsx (out of scope, Plan 03)

`npx eslint src/pages/Dashboard.tsx` reports 6 `@typescript-eslint/no-explicit-any`
errors on lines that PREDATE Plan 03's changes (infinite-query `getNextPageParam`
`lastPage: any[]`, `'saved_jobs' as any`, `resumes: any[]`, `savedJobs: any[]`,
`job` map callbacks). Plan 03 only added a `useSearchParams` mount effect and an
import — the `any` usages are in the existing resume/saved-jobs query code.

Per the executor SCOPE BOUNDARY these are not auto-fixed (not caused by this task's
changes). The repo ESLint config sets `@typescript-eslint/no-unused-vars` off but
not `no-explicit-any`; these errors exist on the base `staging` tree. Recommend a
separate typing pass (define `Resume` / `SavedJob` interfaces) outside this plan.
