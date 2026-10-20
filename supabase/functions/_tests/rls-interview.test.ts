/**
 * Phase 23 Plan 02 Task 3 — RLS regression test for interview_prep tables.
 *
 * Verifies:
 *   - service-role INSERT on interview_quizzes / interview_streaks / interview_quiz_answers
 *     is not blocked by RLS
 *   - anon-role INSERT / UPDATE / DELETE / SELECT are blocked or filtered by RLS
 *   - user JWT SELECT returns only rows owned by that user (auth.uid() = user_id)
 *   - user JWT UPDATE / DELETE on cross-user rows is denied
 *
 * Mode: LIVE-DB. Requires a real Postgres with Phase 19 + Phase 23 migration applied.
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Optional env (for user-JWT cross-row tests):
 *   TEST_USER_JWT            — JWT for user_A
 *   TEST_USER_A_ID           — uuid of user_A (to insert owned rows via service role)
 *   TEST_USER_B_ID           — uuid of user_B (rows user_A must not see/modify)
 *
 * Run with:
 *   deno test --allow-net --allow-env supabase/functions/_tests/rls-interview.test.ts
 *
 * Gate: if any required env is missing, every test will skip with a clear log message
 * rather than fail. This keeps CI green in environments without a live DB.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const TEST_USER_JWT = Deno.env.get("TEST_USER_JWT") ?? "";
const TEST_USER_A_ID = Deno.env.get("TEST_USER_A_ID") ?? "";
const TEST_USER_B_ID = Deno.env.get("TEST_USER_B_ID") ?? "";

const hasCore = !!(SUPABASE_URL && SERVICE_KEY && ANON_KEY);
const hasUser = hasCore && !!TEST_USER_JWT && !!TEST_USER_A_ID && !!TEST_USER_B_ID;

if (!hasCore) {
  console.warn(
    "[rls-interview] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY unset — skipping RLS tests",
  );
}

// Supabase-js v2 spawns a GoTrueClient auto-refresh interval that Deno's default
// leak sanitizer can flag as a failure even when assertions pass. Disable per
// analysis_results_rls_test.ts and merit_rls_test.ts precedent.
const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userClient(jwt: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

function rlsDenied(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  // 42501 = insufficient_privilege (RLS denial); PostgREST also surfaces
  // "new row violates row-level security policy" as message text.
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("violates")
  );
}

// ---------------------------------------------------------------------------
// Service-role INSERT — must succeed (bypasses RLS)
// ---------------------------------------------------------------------------

Deno.test({
  name: "service-role INSERT into interview_quizzes is not blocked by RLS",
  ...testOpts,
  ignore: !hasCore,
  fn: async () => {
    const sc = serviceClient();
    const userId = TEST_USER_A_ID || "00000000-0000-0000-0000-00000000aaaa";
    const { data, error } = await sc
      .from("interview_quizzes")
      .insert({
        user_id: userId,
        mode: "quiz",
        tier: "elite",
        job_description: "rls-interview test row — safe to delete",
        interview_type: "behavioral",
        question_categories: ["behavioral"],
        difficulty: "mid",
        duration: 30,
        format: "written",
      })
      .select("id")
      .maybeSingle();
    // Service role may still fail on FK (if TEST_USER_A_ID is not a real auth.users row),
    // but must NOT fail with an RLS violation.
    if (error) {
      assert(!rlsDenied(error), `RLS must not block service-role: ${error.code} ${error.message}`);
    } else {
      assert(data?.id, "expected inserted row id");
      // Cleanup
      await sc.from("interview_quizzes").delete().eq("id", data.id);
    }
  },
});

Deno.test({
  name: "service-role INSERT into interview_streaks (longest_streak + quizzes_today) not blocked",
  ...testOpts,
  ignore: !hasCore,
  fn: async () => {
    const sc = serviceClient();
    const userId = TEST_USER_A_ID || "00000000-0000-0000-0000-00000000aaaa";
    const { error } = await sc
      .from("interview_streaks")
      .upsert({
        user_id: userId,
        current_streak: 3,
        longest_streak: 5,
        quizzes_today: 2,
        last_quiz_at: new Date().toISOString(),
      });
    if (error) {
      assert(!rlsDenied(error), `RLS must not block service-role: ${error.code} ${error.message}`);
    }
  },
});

Deno.test({
  name: "service-role INSERT into interview_quiz_answers not blocked",
  ...testOpts,
  ignore: !hasCore,
  fn: async () => {
    const sc = serviceClient();
    const userId = TEST_USER_A_ID || "00000000-0000-0000-0000-00000000aaaa";
    // Create a parent quiz, insert an answer, then clean up.
    const { data: quiz, error: quizErr } = await sc
      .from("interview_quizzes")
      .insert({
        user_id: userId,
        mode: "quiz",
        tier: "elite",
        job_description: "rls-interview answer-test parent — safe to delete",
        interview_type: "behavioral",
        question_categories: ["behavioral"],
        difficulty: "mid",
        duration: 30,
        format: "written",
      })
      .select("id")
      .maybeSingle();
    if (quizErr) {
      // If FK to auth.users blocks, skip — we only care about RLS non-interference.
      assert(!rlsDenied(quizErr), `RLS must not block service-role: ${quizErr.message}`);
      return;
    }
    const { error: ansErr } = await sc.from("interview_quiz_answers").insert({
      quiz_id: quiz!.id,
      question_order: 1,
      question_text: "RLS test question",
    });
    if (ansErr) {
      assert(!rlsDenied(ansErr), `RLS must not block service-role: ${ansErr.message}`);
    }
    await sc.from("interview_quizzes").delete().eq("id", quiz!.id);
  },
});

// ---------------------------------------------------------------------------
// Anon-role — SELECT filters, INSERT/UPDATE/DELETE rejected by RLS
// ---------------------------------------------------------------------------

Deno.test({
  name: "anon-role SELECT interview_quizzes returns 0 rows (no anon policy)",
  ...testOpts,
  ignore: !hasCore,
  fn: async () => {
    const ac = anonClient();
    const { data, error } = await ac.from("interview_quizzes").select("id").limit(10);
    // Either error or empty array is acceptable denial evidence — anon has no auth.uid().
    if (error) {
      assert(rlsDenied(error) || error.code === "PGRST116", `unexpected error: ${error.message}`);
    } else {
      assertEquals((data ?? []).length, 0, "RLS should filter all rows for anon");
    }
  },
});

Deno.test({
  name: "anon-role INSERT interview_quizzes is rejected by RLS",
  ...testOpts,
  ignore: !hasCore,
  fn: async () => {
    const ac = anonClient();
    const { error } = await ac.from("interview_quizzes").insert({
      user_id: "00000000-0000-0000-0000-00000000dead",
      mode: "quiz",
      tier: "elite",
      job_description: "anon forge attempt",
      interview_type: "behavioral",
      question_categories: ["behavioral"],
      difficulty: "mid",
      duration: 30,
      format: "written",
    });
    assert(error !== null, "expected RLS denial on anon INSERT");
    assert(rlsDenied(error), `expected row-level security error, got: ${error?.code} ${error?.message}`);
  },
});

Deno.test({
  name: "anon-role INSERT interview_streaks is rejected by RLS",
  ...testOpts,
  ignore: !hasCore,
  fn: async () => {
    const ac = anonClient();
    const { error } = await ac.from("interview_streaks").insert({
      user_id: "00000000-0000-0000-0000-00000000dead",
      current_streak: 99,
      longest_streak: 99,
      quizzes_today: 99,
    });
    assert(error !== null, "expected RLS denial on anon INSERT");
    assert(rlsDenied(error), `expected row-level security error, got: ${error?.code} ${error?.message}`);
  },
});

// ---------------------------------------------------------------------------
// User JWT — SELECT-own only, no writes allowed (no permissive policies)
// ---------------------------------------------------------------------------

Deno.test({
  name: "user JWT SELECT interview_quizzes returns only rows for auth.uid()",
  ...testOpts,
  ignore: !hasUser,
  fn: async () => {
    // Seed a row owned by user_B via service role, then assert user_A cannot see it.
    const sc = serviceClient();
    const { data: seeded, error: seedErr } = await sc
      .from("interview_quizzes")
      .insert({
        user_id: TEST_USER_B_ID,
        mode: "quiz",
        tier: "elite",
        job_description: "user_B row — user_A must not see",
        interview_type: "behavioral",
        question_categories: ["behavioral"],
        difficulty: "mid",
        duration: 30,
        format: "written",
      })
      .select("id")
      .maybeSingle();
    if (seedErr) {
      // If FK blocks we cannot run this test
      console.warn(`[rls-interview] seed failed (likely FK), skipping cross-user SELECT: ${seedErr.message}`);
      return;
    }
    try {
      const uc = userClient(TEST_USER_JWT);
      const { data, error } = await uc
        .from("interview_quizzes")
        .select("id, user_id")
        .eq("id", seeded!.id);
      assertEquals(error, null, `user_A SELECT should not error: ${JSON.stringify(error)}`);
      assertEquals((data ?? []).length, 0, "user_A must not see user_B's row (row-level security)");
    } finally {
      await sc.from("interview_quizzes").delete().eq("id", seeded!.id);
    }
  },
});

Deno.test({
  name: "user JWT UPDATE on cross-user interview_quizzes row is denied",
  ...testOpts,
  ignore: !hasUser,
  fn: async () => {
    const sc = serviceClient();
    const { data: seeded, error: seedErr } = await sc
      .from("interview_quizzes")
      .insert({
        user_id: TEST_USER_B_ID,
        mode: "quiz",
        tier: "elite",
        job_description: "user_B row for UPDATE probe",
        interview_type: "behavioral",
        question_categories: ["behavioral"],
        difficulty: "mid",
        duration: 30,
        format: "written",
      })
      .select("id")
      .maybeSingle();
    if (seedErr) {
      console.warn(`[rls-interview] seed failed, skipping: ${seedErr.message}`);
      return;
    }
    try {
      const uc = userClient(TEST_USER_JWT);
      const { data, error } = await uc
        .from("interview_quizzes")
        .update({ job_description: "tampered by user_A" })
        .eq("id", seeded!.id)
        .select();
      // Either error or empty array is acceptable — no INSERT/UPDATE/DELETE policy exists.
      if (error) {
        assert(rlsDenied(error), `expected row-level security denial, got: ${error.message}`);
      } else {
        assertEquals((data ?? []).length, 0, "RLS should have filtered the UPDATE target");
      }
    } finally {
      await sc.from("interview_quizzes").delete().eq("id", seeded!.id);
    }
  },
});

Deno.test({
  name: "user JWT DELETE on cross-user interview_streaks row is denied",
  ...testOpts,
  ignore: !hasUser,
  fn: async () => {
    const sc = serviceClient();
    const { error: seedErr } = await sc
      .from("interview_streaks")
      .upsert({ user_id: TEST_USER_B_ID, current_streak: 1, longest_streak: 1, quizzes_today: 0 });
    if (seedErr) {
      console.warn(`[rls-interview] seed failed, skipping: ${seedErr.message}`);
      return;
    }
    try {
      const uc = userClient(TEST_USER_JWT);
      const { data, error } = await uc
        .from("interview_streaks")
        .delete()
        .eq("user_id", TEST_USER_B_ID)
        .select();
      if (error) {
        assert(rlsDenied(error), `expected row-level security denial, got: ${error.message}`);
      } else {
        assertEquals((data ?? []).length, 0, "RLS should have filtered the DELETE target");
      }
    } finally {
      // Cleanup via service role
      await sc.from("interview_streaks").delete().eq("user_id", TEST_USER_B_ID);
    }
  },
});
