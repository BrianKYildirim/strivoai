import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── D-06: the remote database lane must FAIL LOUDLY, never silently degrade ────────────
//
// The rule this module enforces: a remote run that is misconfigured must THROW, never pass
// vacuously. A lane that quietly skips when creds are absent reports green having executed
// zero assertions, and every deploy gated on it is then gated on nothing. Phase 9 has
// already caught three separate vacuous-pass defects; this is the same failure class.
//
// `requireRemoteConfig()` below is the single validation seam. `skipRemote()` (the existing
// per-test gate) and `_tests/remote-preflight.test.ts` (the lane-level gate) both route
// through it, so there is exactly ONE definition of "correctly configured".
//
// No secret VALUE is ever echoed: an invalid key is reported as "empty", never printed.

/** The preview/staging project. staging == test == preview: ONE non-prod project. */
export const PREVIEW_PROJECT_REF = "cimjltzovkahkqecpwgi";
/** Production. The remote lane WRITES ROWS and must be structurally unable to reach this. */
export const PROD_PROJECT_REF = "zjpjapgraoxdukdvpjes";
/** The .env.example placeholder. An unsubstituted value must throw, not skip. */
export const PLACEHOLDER_HOST = "test.supabase.co";

export const remoteEnabled = () => Deno.env.get("DENO_TEST_SUPABASE_REMOTE") === "1";

export function optionalEnv(name: string): string {
  return Deno.env.get(name) ?? "";
}

export function requireRemoteEnv(name: string): string {
  const value = optionalEnv(name);
  if (!value) throw new Error(`${name} must be set for TEST-05 remote history persistence tests`);
  return value;
}

/**
 * The preview project URL / service-role key, under any of the names this repo uses for the
 * ONE non-prod project. staging == test == preview == `cimjltzovkahkqecpwgi` (the topology is
 * stated in TESTING-STRATEGY.md and docs/ENVIRONMENT.md), so these names are aliases for the
 * same project, not different environments.
 *
 * WHY THE FALLBACK EXISTS (09-09): the `*_STAGING` names appear ONLY in
 * `.env.test.local.example` — they are absent from the real `.env.test.local`, from the
 * machine env, and from the GitHub Actions secret set (which has carried `SUPABASE_TEST_*`
 * since 2026-06-10). 09-09 folds this lane into the BLOCKING `verify:baseline` gate, so a lane
 * that can only resolve a name nobody provisions would abort EVERY deploy — and an
 * always-red gate is a bypassed gate (operators reach for `-SkipVerify`), which is strictly
 * worse than no gate.
 *
 * This is a NAME-resolution fallback, never a VALIDATION relaxation: whichever alias supplies
 * the value still runs the full gauntlet below (non-empty, not the placeholder, not
 * production, positively the preview ref). Mirrors requireAnonKey()'s existing chain.
 */
const STAGING_URL_NAMES = ["SUPABASE_URL_STAGING", "STAGING_SUPABASE_URL", "SUPABASE_TEST_URL"];
const STAGING_KEY_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY_STAGING",
  "STAGING_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_TEST_SERVICE_ROLE_KEY",
];

function firstSet(names: string[]): string {
  for (const name of names) {
    const value = optionalEnv(name);
    if (value) return value;
  }
  return "";
}

/**
 * Validate the remote lane's configuration, or THROW. Never returns a partial result.
 *
 * Four checks, in escalating order of consequence:
 *   1. the preview URL is non-empty (under any of STAGING_URL_NAMES)
 *   2. ...and is not the unsubstituted placeholder
 *   3. ...and does NOT resolve to the PRODUCTION project (T-09-07-C — this lane writes rows)
 *   4. the preview service-role key is non-empty (value never echoed)
 */
export function requireRemoteConfig(): { url: string; key: string } {
  const url = firstSet(STAGING_URL_NAMES);
  if (!url) {
    throw new Error(
      `REMOTE CONFIG INVALID: none of ${STAGING_URL_NAMES.join(" / ")} is set. The remote DB ` +
        "lane must never silently degrade to the offline lane — set one to the preview project URL " +
        `(${PREVIEW_PROJECT_REF}).`,
    );
  }
  if (url.includes(PLACEHOLDER_HOST)) {
    throw new Error(
      `REMOTE CONFIG INVALID: the preview URL is still the placeholder https://${PLACEHOLDER_HOST}. ` +
        `Set it to the real preview project URL (${PREVIEW_PROJECT_REF}).`,
    );
  }
  // T-09-07-C. The most important safety property of this lane: it inserts and deletes rows.
  // Pointing it at production would mean writing test rows to production.
  if (url.includes(PROD_PROJECT_REF)) {
    throw new Error(
      `REMOTE LANE POINTED AT PRODUCTION: the preview URL resolves to the PRODUCTION project ` +
        `ref ${PROD_PROJECT_REF}. This lane WRITES ROWS and is forbidden from touching production. ` +
        `Point it at the preview project (${PREVIEW_PROJECT_REF}) instead.`,
    );
  }
  if (!url.includes(PREVIEW_PROJECT_REF)) {
    throw new Error(
      `REMOTE CONFIG INVALID: the preview URL does not resolve to the expected preview project ` +
        `ref ${PREVIEW_PROJECT_REF}. Refusing to run a row-writing lane against an unrecognized project.`,
    );
  }
  // Never echo the key value — only its presence.
  const key = firstSet(STAGING_KEY_NAMES);
  if (!key) {
    throw new Error(
      `REMOTE CONFIG INVALID: none of ${STAGING_KEY_NAMES.join(" / ")} is set; set one to the ` +
        "preview service role key. (Server-side only — never printed, never written to an artifact.)",
    );
  }
  return { url, key };
}

export function skipRemote(label: string): boolean {
  if (!remoteEnabled()) {
    console.log(`[history-persistence] SKIP ${label} - set DENO_TEST_SUPABASE_REMOTE=1 to run staging persistence tests`);
    return true;
  }
  // Remote IS enabled: fail loudly (do NOT silently skip) when staging secrets are missing,
  // are still the placeholder, or resolve to production — so a misconfigured remote run
  // cannot pass vacuously. Single source of truth, shared with the lane-level preflight.
  requireRemoteConfig();
  return false;
}

function requireStagingUrl(): string {
  return requireRemoteConfig().url;
}

function requireStagingServiceRoleKey(): string {
  return requireRemoteConfig().key;
}

export async function freshClient() {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const { url, key } = requireRemoteConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function functionUrl(name: string): string {
  const url = requireStagingUrl();
  return `${url.replace(/\/$/, "")}/functions/v1/${name}`;
}

// ── The fixture bootstrap ─────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS (09-07). These tests were originally written against three env vars —
// MERIT_TEST_USER_ID, MERIT_TEST_USER_JWT, MERIT_TEST_RESUME_ID — that are provisioned by
// NOTHING: not .env.test.local, not .env.test.local.example, not docs/ENVIRONMENT.md, not
// any script, not any CI workflow. That is the real reason this whole lane has never run.
//
// And MERIT_TEST_USER_JWT could never have worked as a stored CI secret anyway: a Supabase
// access token expires in ~1 hour, so a static secret would go stale within a day of being
// minted. The fixture must be MINTED PER RUN. That is what this does.
//
// Fail-loud, never vacuous (D-06): every failure path here THROWS. There is no branch that
// returns a partial fixture or degrades to a skip.
//
// Safety: requireRemoteConfig() has already proven the target is the PREVIEW project and is
// structurally incapable of being production, so the writes below cannot land on prod.
// D-15: all seeded content is SYNTHETIC — no real-person markers.

const FIXTURE_EMAIL_PREFIX = "remote-history-fixture";
const FIXTURE_RESUME_TEXT =
  "Senior product manager with eight years of experience leading cross-functional launches, " +
  "improving activation by 24 percent, owning analytics instrumentation, running customer " +
  "discovery, and managing roadmap delivery across engineering, design, sales, and success teams.";

export interface RemoteTestFixture {
  userId: string;
  jwt: string;
  resumeId: string;
}

/** The preview anon key, under any of the names this repo has historically used for it. */
function requireAnonKey(): string {
  const key = optionalEnv("SUPABASE_ANON_KEY_STAGING") ||
    optionalEnv("SUPABASE_TEST_ANON_KEY") ||
    optionalEnv("STAGING_SUPABASE_ANON_KEY");
  if (!key) {
    throw new Error(
      "REMOTE FIXTURE FAILED: no preview anon key. Set SUPABASE_ANON_KEY_STAGING (or " +
        "SUPABASE_TEST_ANON_KEY). It is needed to MINT a fresh user JWT — a stored " +
        "MERIT_TEST_USER_JWT cannot work, Supabase access tokens expire in ~1 hour.",
    );
  }
  return key;
}

/**
 * Best-effort prune of fixture users from earlier runs, so a unique-user-per-file lane does
 * not accumulate auth rows in preview forever (T-09-07-D: no unbounded test-data pollution).
 * Never throws — a prune failure must not fail the lane it is only tidying up after.
 */
async function pruneStaleFixtureUsers(client: {
  from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<unknown> } };
}): Promise<void> {
  try {
    const listed = await adminFetch("/auth/v1/admin/users?per_page=200", { method: "GET" });
    if (!listed.ok) {
      await listed.body?.cancel();
      return;
    }
    const users: Array<{ id: string; email?: string; created_at?: string }> = (await listed.json()).users ?? [];
    const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2h — never touches a concurrent run
    for (const user of users) {
      if (!user.email?.startsWith(`${FIXTURE_EMAIL_PREFIX}+`)) continue;
      if (user.created_at && Date.parse(user.created_at) > cutoff) continue;
      // Resumes are FK'd to the user; clear them before deleting the auth row.
      await client.from("resumes").delete().eq("user_id", user.id);
      const removed = await adminFetch(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
      await removed.body?.cancel();
    }
  } catch {
    // Intentionally swallowed: pruning is housekeeping, not a gate.
  }
}

async function adminFetch(path: string, init: RequestInit): Promise<Response> {
  const { url, key } = requireRemoteConfig();
  return await fetch(`${url.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
}

/** Memoized per module instance: one fixture user per test FILE, not per test. */
let fixturePromise: Promise<RemoteTestFixture> | null = null;

/**
 * Provision a preview fixture user and mint a fresh JWT for it.
 *
 * Honors an externally-injected fixture (MERIT_TEST_USER_ID + MERIT_TEST_USER_JWT +
 * MERIT_TEST_RESUME_ID) so CI can supply its own; otherwise self-provisions. Either way it
 * THROWS on any failure — it never hands back a half-built fixture.
 *
 * Each test FILE gets its OWN user (unique email). That is deliberate: `deno test` runs test
 * files in parallel workers, and a shared fixture user whose password gets reset by a
 * concurrently-starting file would have its already-minted JWTs revoked mid-test. A unique
 * user per file makes the lane structurally race-free instead of merely usually-fine.
 */
export function remoteTestFixture(): Promise<RemoteTestFixture> {
  fixturePromise ??= provisionFixture();
  return fixturePromise;
}

async function provisionFixture(): Promise<RemoteTestFixture> {
  const injectedUser = optionalEnv("MERIT_TEST_USER_ID");
  const injectedJwt = optionalEnv("MERIT_TEST_USER_JWT");
  const injectedResume = optionalEnv("MERIT_TEST_RESUME_ID");
  if (injectedUser && injectedJwt && injectedResume) {
    return { userId: injectedUser, jwt: injectedJwt, resumeId: injectedResume };
  }

  const anonKey = requireAnonKey();
  const client = await freshClient();

  // Unique per test file — see the race note above. Never reused, so never reset.
  const email = `${FIXTURE_EMAIL_PREFIX}+${crypto.randomUUID()}@strivo.test`;
  // A fresh per-run password. Never logged, never persisted.
  const password = `Fx!${crypto.randomUUID()}`;

  await pruneStaleFixtureUsers(client);

  // 1. Create the fixture user.
  const created = await adminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!created.ok) {
    const status = created.status;
    await created.body?.cancel();
    throw new Error(`REMOTE FIXTURE FAILED: could not create the fixture user (HTTP ${status}).`);
  }
  const userId = (await created.json()).id as string;
  if (!userId) throw new Error("REMOTE FIXTURE FAILED: the admin API returned no user id.");

  // 2. Elite tier, so every feature's entitlement gate is open (recruiting-lens is
  //    Elite-only). The profiles row is created by a signup trigger; upsert to be safe.
  const { error: profileError } = await client
    .from("profiles")
    .upsert({ id: userId, email, subscription_tier: "elite" }, { onConflict: "id" });
  if (profileError) {
    throw new Error(`REMOTE FIXTURE FAILED: could not set the fixture profile to elite: ${profileError.message}`);
  }

  // 3. A synthetic resume row for the features that take a resumeId (D-15).
  const { data: resume, error: resumeError } = await client
    .from("resumes")
    .insert({
      user_id: userId,
      file_name: "remote-history-fixture.pdf",
      file_url: "https://example.invalid/remote-history-fixture.pdf",
      file_size: FIXTURE_RESUME_TEXT.length,
      extracted_text: FIXTURE_RESUME_TEXT,
    })
    .select("id")
    .single();
  if (resumeError || !resume?.id) {
    throw new Error(`REMOTE FIXTURE FAILED: could not seed the fixture resume: ${resumeError?.message ?? "no id"}`);
  }

  // 4. MINT the JWT. This is the step a stored secret can never do correctly.
  const tokenResponse = await fetch(
    `${requireStagingUrl().replace(/\/$/, "")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!tokenResponse.ok) {
    const status = tokenResponse.status;
    await tokenResponse.body?.cancel();
    // Report the STATUS only — never the password, never the key.
    throw new Error(`REMOTE FIXTURE FAILED: could not mint a JWT for the fixture user (HTTP ${status}).`);
  }
  const jwt = (await tokenResponse.json()).access_token as string;
  if (!jwt) throw new Error("REMOTE FIXTURE FAILED: the token endpoint returned no access_token.");

  return { userId, jwt, resumeId: resume.id as string };
}

export async function invokeFunction(
  name: string,
  jwt: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const response = await fetch(functionUrl(name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body: any = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
}

export function assertFunctionSucceeded(result: { status: number; body: any }, functionName: string): void {
  if (result.status >= 200 && result.status < 300) return;

  const serialized = JSON.stringify(result.body);
  let hint = "The function failed before TEST-05 could assert history persistence.";
  if (serialized.includes("missing required sections")) {
    hint = "The live staging AI response failed feature validation before persistence. For deterministic TEST-05 runs, deploy the function with AI_TEST_MODE=true on staging.";
  } else if (serialized.includes("internal_error")) {
    hint = "The staging function returned a generic internal error before persistence. Check Supabase function logs; for deterministic TEST-05 runs, deploy the function with AI_TEST_MODE=true on staging.";
  }

  assert(false, `${functionName} failed: ${result.status} ${serialized}. ${hint}`);
}

export async function latestLinkedUsage(params: {
  userId: string;
  actionType: string;
  sinceIso: string;
}): Promise<{ id: string; analysis_id: string; created_at: string }> {
  const client = await freshClient();
  const { data, error } = await client
    .from("usage_tracking")
    .select("id, analysis_id, created_at")
    .eq("user_id", params.userId)
    .eq("action_type", params.actionType)
    .gte("created_at", params.sinceIso)
    .not("analysis_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`usage_tracking query failed: ${error.message}`);
  assert(data?.analysis_id, `Expected linked usage row for ${params.actionType}`);
  return data as { id: string; analysis_id: string; created_at: string };
}

export async function assertAnalysisResult(params: {
  analysisId: string;
  analysisType: string;
}): Promise<Record<string, unknown>> {
  const client = await freshClient();
  const { data, error } = await client
    .from("analysis_results")
    .select("id, analysis_type, source_reference, primary_score")
    .eq("id", params.analysisId)
    .eq("analysis_type", params.analysisType)
    .maybeSingle();
  if (error) throw new Error(`analysis_results query failed: ${error.message}`);
  assert(data?.id, `Expected analysis_results row ${params.analysisId}`);
  return data as Record<string, unknown>;
}

export async function assertTableRow(table: string, id: string): Promise<Record<string, unknown>> {
  const client = await freshClient();
  const { data, error } = await client
    .from(table)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`${table} query failed: ${error.message}`);
  assertEquals(data?.id, id);
  return data as Record<string, unknown>;
}

export async function cleanupRows(rows: Array<{ table: string; id: string | null | undefined }>): Promise<void> {
  const client = await freshClient();
  for (const row of rows) {
    if (!row.id) continue;
    await client.from(row.table).delete().eq("id", row.id);
  }
}
