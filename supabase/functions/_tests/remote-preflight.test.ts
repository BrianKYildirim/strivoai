import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PREVIEW_PROJECT_REF,
  remoteEnabled,
  requireRemoteConfig,
} from "../_shared/__tests__/history-persistence-remote.ts";

// ── D-06: the fail-loud gate for the remote DATABASE lane ─────────────────────────────
//
// This file MUST be the first entry in deno.json's `test:remote` task (09-08 registers it),
// so a broken lane fails ONCE, clearly, instead of N times as confusing per-test network
// errors.
//
// Why this exists at all
// ----------------------
// Every other remote-gated test in this repo uses skip-WITHOUT-failing semantics: at
// DENO_TEST_SUPABASE_REMOTE=0 they log "SKIP" and report ok. That is correct for the OFFLINE
// lane, but it means that if `test:remote` were ever invoked without the env var, the lane
// would report GREEN having executed zero assertions — a false-green gate, which is strictly
// worse than no gate, because every deploy behind it is then gated on nothing.
//
// Phase 9 has already caught three defects of exactly this class (a cron health check that
// reported success on a 401; a `state NOT IN (...)` stuck-row query that excludes NULL rows
// by construction and can never count anything; an E2E spec that hit a dedup path for a month
// instead of its named flow). A remote lane that silently skips when creds are absent is the
// same bug wearing a different hat.
//
// So this file inverts the usual polarity. In the offline lane it does not skip — it THROWS.
// An unconfigured remote lane is LOUD, never silently green.

Deno.test("remote-preflight: DENO_TEST_SUPABASE_REMOTE=1 is REQUIRED (the lane must never silently degrade)", () => {
  // THE NEGATIVE ASSERTION. This is the one that forecloses the silent-degrade path: even
  // if someone wires `test:remote` without the env var, the lane FAILS rather than passing
  // vacuously. The message must also name the sanctioned, LOUD way out — an operator who
  // needs to bypass should reach for the documented switch, not for deleting this test.
  assert(
    remoteEnabled(),
    "REMOTE PREFLIGHT FAILED: test:remote was invoked without DENO_TEST_SUPABASE_REMOTE=1. " +
      "The remote DB lane must never silently degrade to the offline lane — a lane that skips " +
      "when creds are absent reports green having executed zero assertions. " +
      "Run `npm run test:edge:remote`, or bypass explicitly and loudly with " +
      "`deploy.ps1 -SkipRemoteDbLane` (emergency only).",
  );
});

Deno.test("remote-preflight: config is valid, and the lane is structurally incapable of pointing at production", () => {
  if (!remoteEnabled()) return; // assertion 1 above owns this failure; don't double-report.

  // Reuses the SAME validation seam skipRemote() uses, so there is exactly one definition of
  // "correctly configured": non-empty URL, not the https://test.supabase.co placeholder,
  // NOT the production project ref, non-empty service-role key (value never echoed).
  const { url } = requireRemoteConfig();

  // Restate the prod-safety property as its own assertion (T-09-07-C). This lane INSERTS and
  // DELETES rows; the single worst outcome available to it is doing that to production.
  assert(
    url.includes(PREVIEW_PROJECT_REF),
    `REMOTE PREFLIGHT FAILED: the remote lane must target the preview project (${PREVIEW_PROJECT_REF}). It writes rows.`,
  );
});

Deno.test("remote-preflight: the preview project is REACHABLE (an unreachable project fails, never skips)", async () => {
  if (!remoteEnabled()) return; // assertion 1 above owns this failure.

  const { url, key } = requireRemoteConfig();
  const target = `${url.replace(/\/$/, "")}/rest/v1/`;

  let status: number;
  try {
    const response = await fetch(target, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10_000),
    });
    status = response.status;
    // Drain the body so Deno's resource sanitizer stays happy.
    await response.body?.cancel();
  } catch (error) {
    // A network error or a timeout must produce the same LOUD, actionable message as a bad
    // status — never a raw stack trace, and never a skip.
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `REMOTE PREFLIGHT FAILED: could not reach the preview project at ${target} (${reason}). ` +
        `The preview Supabase project (${PREVIEW_PROJECT_REF}) is likely PAUSED or unreachable. ` +
        "Unpause it — do NOT skip this lane. (It was paused for all of v4.0.)",
    );
  }

  // PostgREST answers the bare /rest/v1/ root with 200 (OpenAPI spec) or 404 depending on
  // config; both prove the project is UP. Anything else — 401/403/5xx, or the 540/503 a
  // paused project serves — is a hard failure.
  assert(
    status === 200 || status === 404,
    `REMOTE PREFLIGHT FAILED: preview project ${target} returned ${status}. ` +
      `The preview Supabase project (${PREVIEW_PROJECT_REF}) is likely PAUSED or unreachable. ` +
      "Unpause it — do NOT skip this lane. (It was paused for all of v4.0.)",
  );
});
