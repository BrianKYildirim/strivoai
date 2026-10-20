// ── 260723-2b0 · Task 2 — prove the resumes.analyzed_tier tamper boundary AS AN
//    AUTHENTICATED USER (remote, live Postgres + PostgREST).
//
// Task 1 replaced the Supabase-default table-wide UPDATE/INSERT on public.resumes with
// column-scoped grants that EXCLUDE analyzed_tier (and every analysis-owned column). A
// service-role test cannot catch EITHER failure mode of that change:
//   * over-TIGHT grants would 403 legitimate client writes (Upload / Profile / Auth / the
//     Task 8 clone) — a regression that only shows up under a real user JWT, because the
//     service role bypasses column privileges entirely;
//   * over-LOOSE grants would let a user FORGE analyzed_tier and suppress the paid rerun
//     CTA — again invisible to a service-role client.
//
// So every request below is issued with the fixture's minted USER JWT (role=authenticated),
// never the service-role key. We assert on the SQLSTATE / HTTP status, not on message text.
//
// MERIT_SYSTEM_ENABLED is irrelevant here — this exercises PostgREST column privileges
// directly and never routes through _shared/merit-gateway.ts.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanupRows,
  optionalEnv,
  remoteTestFixture,
  requireRemoteConfig,
  skipRemote,
} from "./history-persistence-remote.ts";

/** The preview anon key, under any of the names this repo uses for it (mirrors the harness). */
function anonKey(): string {
  const key = optionalEnv("SUPABASE_ANON_KEY_STAGING") ||
    optionalEnv("SUPABASE_TEST_ANON_KEY") ||
    optionalEnv("STAGING_SUPABASE_ANON_KEY");
  if (!key) {
    throw new Error(
      "REMOTE GRANT TEST FAILED: no preview anon key. Set SUPABASE_ANON_KEY_STAGING (or " +
        "SUPABASE_TEST_ANON_KEY) — needed as the PostgREST apikey for authenticated requests.",
    );
  }
  return key;
}

interface RestResult {
  status: number;
  code: string | null; // Postgres SQLSTATE, when the body carries one
  body: unknown;
}

/** Issue a PostgREST request AS THE AUTHENTICATED USER (apikey=anon, Bearer=user JWT). */
async function asUser(
  jwt: string,
  method: "POST" | "PATCH",
  path: string,
  payload: unknown,
): Promise<RestResult> {
  const { url } = requireRemoteConfig();
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey(),
      Authorization: `Bearer ${jwt}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  const code = (body && typeof body === "object" && "code" in (body as Record<string, unknown>))
    ? String((body as Record<string, unknown>).code)
    : null;
  return { status: response.status, code, body };
}

function insertedId(result: RestResult): string {
  const rows = result.body as Array<{ id?: string }>;
  const id = Array.isArray(rows) ? rows[0]?.id : undefined;
  assert(id, `expected an inserted row id, got ${JSON.stringify(result.body)}`);
  return id as string;
}

/** 42501 = insufficient_privilege. PostgREST surfaces it as HTTP 401/403 with code 42501. */
function assertPrivilegeDenied(result: RestResult, label: string): void {
  assert(
    result.status === 401 || result.status === 403,
    `${label}: expected 401/403, got ${result.status} ${JSON.stringify(result.body)}`,
  );
  assertEquals(result.code, "42501", `${label}: expected SQLSTATE 42501, got ${result.code}`);
}

Deno.test("260723-2b0 grant: authenticated INSERT of file identity columns SUCCEEDS", async () => {
  if (skipRemote("resumes-grant positive insert")) return;
  const { userId, jwt } = await remoteTestFixture();

  const result = await asUser(jwt, "POST", "resumes", {
    user_id: userId,
    file_name: "grant-probe-basic.pdf",
    file_url: "https://example.invalid/grant-probe-basic.pdf",
    file_path: `${userId}/grant-probe-basic.pdf`,
    file_hash: "hash-basic-" + crypto.randomUUID(),
    file_size: 1234,
  });

  assertEquals(result.status, 201, JSON.stringify(result.body));
  await cleanupRows([{ table: "resumes", id: insertedId(result) }]);
});

Deno.test("260723-2b0 grant: authenticated INSERT including extracted_text + text_hash SUCCEEDS (Task 8 clone)", async () => {
  if (skipRemote("resumes-grant clone insert")) return;
  const { userId, jwt } = await remoteTestFixture();

  const result = await asUser(jwt, "POST", "resumes", {
    user_id: userId,
    file_name: "grant-probe-clone.pdf",
    file_url: "https://example.invalid/grant-probe-clone.pdf",
    file_path: `${userId}/grant-probe-clone.pdf`,
    file_hash: "hash-clone-" + crypto.randomUUID(),
    file_size: 2048,
    extracted_text: "Synthetic resume text for the Elite rerun clone path.",
    text_hash: "th-" + crypto.randomUUID(),
  });

  assertEquals(result.status, 201, JSON.stringify(result.body));
  await cleanupRows([{ table: "resumes", id: insertedId(result) }]);
});

Deno.test("260723-2b0 grant: authenticated UPDATE of extraction columns on an owned row SUCCEEDS", async () => {
  if (skipRemote("resumes-grant positive update")) return;
  const { userId, jwt } = await remoteTestFixture();

  const created = await asUser(jwt, "POST", "resumes", {
    user_id: userId,
    file_name: "grant-probe-update.pdf",
    file_url: "https://example.invalid/grant-probe-update.pdf",
    file_path: `${userId}/grant-probe-update.pdf`,
    file_hash: "hash-update-" + crypto.randomUUID(),
    file_size: 4096,
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const id = insertedId(created);

  const updated = await asUser(jwt, "PATCH", `resumes?id=eq.${id}`, {
    extracted_text: "updated extraction text",
    text_hash: "th2-" + crypto.randomUUID(),
    document_hash: "dh-" + crypto.randomUUID(),
    extraction_version: "phase51-v1",
    extraction_metadata: { provider: "pdf_parser" },
  });

  assert(
    updated.status >= 200 && updated.status < 300,
    `expected 2xx on extraction update, got ${updated.status} ${JSON.stringify(updated.body)}`,
  );
  await cleanupRows([{ table: "resumes", id }]);
});

Deno.test("260723-2b0 grant: authenticated INSERT with analyzed_tier is REJECTED (42501)", async () => {
  if (skipRemote("resumes-grant negative insert")) return;
  const { userId, jwt } = await remoteTestFixture();

  const result = await asUser(jwt, "POST", "resumes", {
    user_id: userId,
    file_name: "grant-probe-forge.pdf",
    file_url: "https://example.invalid/grant-probe-forge.pdf",
    file_path: `${userId}/grant-probe-forge.pdf`,
    file_hash: "hash-forge-" + crypto.randomUUID(),
    file_size: 512,
    analyzed_tier: "elite",
  });

  assertPrivilegeDenied(result, "forged analyzed_tier on INSERT");
});

Deno.test("260723-2b0 grant: authenticated UPDATE of analyzed_tier / grading_data is REJECTED (42501)", async () => {
  if (skipRemote("resumes-grant negative update")) return;
  const { userId, jwt } = await remoteTestFixture();

  // An owned row to attempt forging on.
  const created = await asUser(jwt, "POST", "resumes", {
    user_id: userId,
    file_name: "grant-probe-forge-update.pdf",
    file_url: "https://example.invalid/grant-probe-forge-update.pdf",
    file_path: `${userId}/grant-probe-forge-update.pdf`,
    file_hash: "hash-forge-upd-" + crypto.randomUUID(),
    file_size: 640,
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const id = insertedId(created);

  const forgeTier = await asUser(jwt, "PATCH", `resumes?id=eq.${id}`, { analyzed_tier: "elite" });
  assertPrivilegeDenied(forgeTier, "forged analyzed_tier on UPDATE");

  const forgeGrading = await asUser(jwt, "PATCH", `resumes?id=eq.${id}`, {
    grading_data: { overall: 99, forged: true },
  });
  assertPrivilegeDenied(forgeGrading, "forged grading_data on UPDATE");

  await cleanupRows([{ table: "resumes", id }]);
});
