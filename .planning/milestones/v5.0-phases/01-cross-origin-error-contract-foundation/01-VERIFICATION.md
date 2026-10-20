---
phase: 01-cross-origin-error-contract-foundation
verified: 2026-07-01T14:00:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 1: Cross-Origin Error Contract Foundation — Verification Report

**Phase Goal:** Approved production origins (apex + approved www) reach every active Edge Function reliably, structured errors render at the frontend instead of being swallowed by the browser, and the origin mismatch cannot silently recur.
**Verified:** 2026-07-01
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from 01-01-PLAN.md must_haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | corsHeaders for allowlisted Origin echoes that exact Origin in ACAO; non-allowlisted gets no ACAO, never `*` | VERIFIED | `cors.ts:88-90` — only sets ACAO when `allowedOrigins().has(origin)`. `cors.test.ts` EVIL origin asserts `=== null`. |
| 2 | Every origin-dependent response carries `Vary: Origin` | VERIFIED | `cors.ts:84` unconditionally sets `'Vary': 'Origin'` in `corsCore` for `user` type. All matrix test cases assert `Vary: Origin` presence. |
| 3 | `withCors` guarantees CORS on success Responses, thrown Responses (bare 401), OPTIONS preflight; never buffers streaming ReadableStream | VERIFIED | `cors.ts:149-173`. Test cases: thrown-Response-401 test, thrown-Error-500 test, streaming-ReadableStream-passthrough test — all in `cors.test.ts`. `mergeCors` passes `res.body` by reference, never reads it. |
| 4 | `jsonError` produces CORS-tagged body with top-level string `error`, preserving `{ error, message?, resetDate?, tier? }` shape | VERIFIED | `cors.ts:202-216`. `cors.test.ts` tests for 401/402/429/500 all assert `typeof body.error === 'string'` and ACAO presence. Additive-siblings test asserts `resetDate`, `tier`, `message` preserved. |
| 5 | `auth.ts unauthorizedResponse` attaches user CORS headers (for allowlisted Origin) while body stays `{ error: 'Unauthorized' }` | VERIFIED | `auth.ts:55-59` — calls `corsHeaders({ type }, req)` and body is `{ error: 'Unauthorized' }`. `auth.test.ts:56-74` — asserts ACAO === apex on missing-bearer 401 while `body.error === 'Unauthorized'`. |
| 6 | internal and webhook CORS types return `{}` (no CORS headers) | VERIFIED | `cors.ts:73-75` — early return `{}` for internal/webhook. `cors.test.ts:139-146` asserts no ACAO for internal/webhook. `auth.ts:145` passes `'internal'` to `unauthorizedResponse` for internal 401s. |
| 7 | Table-driven `cors.test.ts` is green and asserts header ABSENCE for disallowed origin | VERIFIED | `cors.test.ts` has 5-entry origin matrix (`APEX`, `WWW`, trailing-slash, `EVIL`, no-header) iterated over success/4xx/5xx/preflight paths. EVIL asserts `=== null`. Registered in `deno.json test` task. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| `supabase/functions/_shared/cors.ts` | Env-driven ALLOWED_ORIGINS, origin reflection, withCors + jsonError exports | Yes | Yes — 217 lines; `export async function withCors` on line 149, `export function jsonError` on line 202, `allowedOrigins()` reads `Deno.env.get('ALLOWED_ORIGINS')` on line 42 | Yes — imported by all 21 user functions | VERIFIED |
| `supabase/functions/_shared/cors.test.ts` | Table-driven origin x status x preflight matrix | Yes | Yes — 201 lines; covers `ALLOWED_ORIGINS`, 5-origin matrix, 4 status codes, preflight, withCors guarantees, streaming | Yes — registered in `deno.json test` task | VERIFIED |
| `supabase/functions/_shared/cors-audit.test.ts` | CORS-05 drift guard over 21 user functions | Yes | Yes — 78 lines; 21 functions, 3 assertions each (withCors adoption, OPTIONS routing, no hardcoded ACAO), length guard | Yes — registered in `deno.json test:ci` | VERIFIED |
| `supabase/functions/_shared/auth.ts` | `unauthorizedResponse(req` with CORS tagging | Yes | Yes — `unauthorizedResponse(req: Request, type: CorsType = 'user')` at line 55, calls `corsHeaders({ type }, req)` | Yes — called at 3 user 401 sites and 3 internal 401 sites in same file | VERIFIED |
| `supabase/functions/_shared/auth.test.ts` | Assert CORS on 401 from allowlisted Origin | Yes | Yes — test at line 56: sets `ALLOWED_ORIGINS`, calls `requireAuth` without auth header, asserts `ACAO === 'https://strivoai.net'` and `body.error === 'Unauthorized'` | Yes — registered in `deno.json test` task | VERIFIED |
| `docs/ENVIRONMENT.md` | ALLOWED_ORIGINS per-surface matrix entry; APP_URL no-longer-CORS-source note | Yes | Yes — line 75: full table row for `ALLOWED_ORIGINS` with prod/preview values; line 76: `APP_URL` row explicitly notes "No longer the CORS source of truth — see `ALLOWED_ORIGINS`" | Yes — canonical env doc consumed by operators | VERIFIED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `cors.ts` | `ALLOWED_ORIGINS` env + request Origin | `Deno.env.get('ALLOWED_ORIGINS')` in `allowedOrigins()` (line 42); per-request membership check in `corsCore` (line 88) | WIRED | `grep` confirms no `APP_URL` in `cors.ts` (zero hits). `allowedOrigins()` parses, trims, strips trailing slashes, and caches on raw string equality. |
| `auth.ts` | `cors.ts` | `unauthorizedResponse` calls `corsHeaders({ type }, req)` (line 58); `corsHeaders` and `CorsType` imported from `./cors.ts` (line 18) | WIRED | `grep "corsHeaders\\(\\{ type"` matches `auth.ts:58`. |
| 21 user functions | `cors.ts` | `import { withCors } from '../_shared/cors.ts'`; `serve((req) => withCors(req, 'user', ...)` | WIRED | `grep -l "withCors(req, 'user'"` returns exactly 21 entrypoints. `serve` handler body verified on `analyze-resume`, `keep-warm`, `get-analysis-job-status`. |
| `cors-audit.test.ts` | `deno.json test:ci` | Appended `_shared/cors-audit.test.ts` to `test:ci` file list | WIRED | Last entry in `deno.json test:ci` value (line 5). `test:ci` is the gate run by `verify:baseline` in `deploy.ps1`. |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CORS-01: Centralized env-driven allowlist, no per-endpoint copies | SATISFIED | Single `allowedOrigins()` function in `cors.ts` parses `ALLOWED_ORIGINS`. Zero `APP_URL` reads in `cors.ts`. All 21 functions import from `_shared/cors.ts` only. |
| CORS-02: Apex + www succeed on all active Edge Functions with correct preflight | SATISFIED | 21/21 user functions use `withCors(req, 'user', ...)`. Operator-confirmed live evidence (01-08-SUMMARY): apex + www preflight → reflected ACAO + Vary: Origin on all 4 production-observed functions; real-browser smoke on `www.strivoai.net` confirmed — no more "Failed to fetch". |
| CORS-03: Unapproved origins rejected; no unrestricted wildcard | SATISFIED | `corsCore` only emits ACAO on exact allowlist membership. Never emits `*`. `cors.test.ts` asserts ACAO === null for `https://evil.example`. 01-08-SUMMARY confirms `https://evil.example` and `https://app.strivoai.net` both got no ACAO on prod. |
| CORS-04: CORS headers consistent on success and failure (401/4xx/5xx + preflight) | SATISFIED | `withCors` merges CORS on all exit paths. `jsonError` includes CORS. `unauthorizedResponse` in `auth.ts` includes CORS. `cors.test.ts` matrix covers all paths. |
| CORS-05: All active Edge Functions audited; single-origin/missing-header pattern eliminated | SATISFIED | `cors-audit.test.ts` covers exactly 21 user functions with 3 assertions each (64 tests). Zero hardcoded `Access-Control-Allow-Origin` literals in any function `index.ts`. |
| CORS-06: Automated tests in verify:baseline; production config verified | SATISFIED | `cors.test.ts`, `auth.test.ts`, `cors-audit.test.ts` all registered in `deno.json test:ci` (inside `verify:baseline`). Operator-confirmed production deployment: `ALLOWED_ORIGINS="https://strivoai.net,https://www.strivoai.net"` set; all functions redeployed. |

### Anti-Patterns Found

None. Systematic scan of modified files:

- `cors.ts`: No TODOs, no `return null`, no hardcoded origins, no `*` wildcard, no placeholder implementations.
- `cors.test.ts`: No pending/skipped tests, assertions are substantive (presence AND absence).
- `cors-audit.test.ts`: No TODOs, no skipped entries; length guard actively catches unenrolled functions.
- `auth.ts`: No regression — `unauthorizedResponse` body unchanged (`{ error: 'Unauthorized' }`); internal 401s explicitly pass `'internal'` type (no-CORS preserved).

### Human Verification Required

One item remains operator-gated by design (Claude is read-only on production):

**1. Live production CORS behavior**

**Test:** From a browser at `https://www.strivoai.net`, trigger Resume Analysis, Career Compass, LinkedIn Grader, and Recruiting Lens.
**Expected:** No "Failed to fetch" / opaque CORS errors; `Access-Control-Allow-Origin: https://www.strivoai.net` in network responses.
**Why human:** Cannot issue credentialed live HTTP requests to production from this context.
**Status:** ALREADY CONFIRMED — 01-08-SUMMARY.md records operator-performed real-browser smoke on `www.strivoai.net` with sign-off at the checkpoint gate on 2026-07-01. This item is satisfied by operator evidence; listed only for traceability.

## Verification Summary

All six CORS requirements (CORS-01 through CORS-06) are satisfied. The phase goal is achieved:

- **Single env-driven allowlist** (`ALLOWED_ORIGINS`) replaces the single-origin `APP_URL` source — one chokepoint, no per-endpoint copies.
- **Apex + www both reach every active Edge Function** — 21/21 functions wrapped with `withCors(req, 'user', ...)`; preflight, success, and error paths all carry reflected ACAO + `Vary: Origin`.
- **Unapproved origins fail-closed** — no wildcard; disallowed origins receive no `Access-Control-Allow-Origin`; proven on staging and production.
- **Structured errors render at the frontend** — `withCors` guarantees CORS on thrown Responses (401) and thrown Errors (500); `auth.ts` 401s carry CORS; `jsonError` carries CORS on all 4xx/5xx.
- **Origin mismatch cannot silently recur** — `cors-audit.test.ts` (64 Deno tests) blocks any function from dropping `withCors`, re-introducing an OPTIONS gap, or hand-rolling a hardcoded ACAO literal, gated by `verify:baseline` before every deploy.

---
_Verified: 2026-07-01_
_Verifier: Claude (gsd-verifier)_
