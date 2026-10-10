// Phase 21 MIG-02 RLS probe: verifies analysis_results is read-only from user JWT.
// REQ-IDs: MIG-02.
//
// Mode: LIVE-DB (gated behind RUN_LIVE_MERIT=1 to match merit_rls_test.ts).
// Requires env: STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, TEST_USER_JWT.
//
// Run with:
//   RUN_LIVE_MERIT=1 deno test --allow-all supabase/functions/_tests/analysis_results_rls_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const RUN = Deno.env.get("RUN_LIVE_MERIT") === "1";
const URL_ = Deno.env.get("STAGING_SUPABASE_URL");
const ANON = Deno.env.get("STAGING_SUPABASE_ANON_KEY");
const JWT = Deno.env.get("TEST_USER_JWT");

Deno.test({
  name: "MIG-02: user JWT INSERT on analysis_results is rejected by RLS",
  ignore: !RUN || !URL_ || !ANON || !JWT,
  fn: async () => {
    const client = createClient(URL_!, ANON!, {
      global: { headers: { Authorization: "Bearer " + JWT } },
    });
    const { error } = await client
      .from("analysis_results")
      .insert({
        user_id: "00000000-0000-0000-0000-probe00000001",
        analysis_id: "probe-" + crypto.randomUUID(),
        score: 0,
        analysis_data: { probe: "MIG-02" },
      } as any);
    assert(error !== null, "expected INSERT to be rejected by RLS");
    const codeMatch = error?.code === "42501";
    const msg = (error?.message || "").toLowerCase();
    const msgMatch = msg.includes("row-level security") || msg.includes("violates") || msg.includes("new row");
    assert(codeMatch || msgMatch, "unexpected error shape: " + JSON.stringify(error));
  },
});

Deno.test({
  name: "MIG-02: user JWT SELECT of analysis_results still works",
  ignore: !RUN || !URL_ || !ANON || !JWT,
  fn: async () => {
    const client = createClient(URL_!, ANON!, {
      global: { headers: { Authorization: "Bearer " + JWT } },
    });
    const { data, error } = await client
      .from("analysis_results")
      .select("id, user_id, created_at")
      .limit(5);
    assertEquals(error, null, "SELECT should succeed: " + JSON.stringify(error));
    assert(Array.isArray(data), "data should be an array");
  },
});
