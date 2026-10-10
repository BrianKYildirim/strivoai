import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractRecruitingLens } from "../extract-recruiting-lens.ts";

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeMockSupabase(overrides: Record<string, unknown> = {}) {
  const state = {
    jdInsertCalled: false,
    jdInsertRow: null as Record<string, unknown> | null,
    applicationsUpdateCalled: false,
    applicationsInsertCalled: false,
    applicationsInsertRow: null as Record<string, unknown> | null,
    existingJdId: null as string | null,
    existingAppId: null as string | null,
    backfillUpdateCount: 0,
    ...overrides,
  };

  const supabase = {
    _state: state,
    from(table: string) {
      return {
        _table: table,
        select(_cols: string) {
          return this;
        },
        eq(_col: string, _val: unknown) {
          return this;
        },
        gte(_col: string, _val: unknown) {
          return this;
        },
        is(_col: string, _val: unknown) {
          return this;
        },
        order(_col: string, _opts?: unknown) {
          return this;
        },
        limit(_count: number) {
          return this;
        },
        update(_row: Record<string, unknown>) {
          if (table === "applications") {
            state.applicationsUpdateCalled = true;
          }
          return {
            ...this,
            eq: (_c: string, _v: unknown) => ({
              ...this,
              eq: (_c2: string, _v2: unknown) => ({
                ...this,
                is: (_c3: string, _v3: unknown) => ({
                  ...this,
                  gte: (_c4: string, _v4: unknown) =>
                    Promise.resolve({
                      data: null,
                      error: null,
                      count: state.backfillUpdateCount,
                    }),
                }),
              }),
            }),
          };
        },
        insert(row: Record<string, unknown>) {
          if (table === "job_descriptions") {
            state.jdInsertCalled = true;
            state.jdInsertRow = row;
          }
          if (table === "applications") {
            state.applicationsInsertCalled = true;
            state.applicationsInsertRow = row;
          }
          return {
            ...this,
            select: (_cols: string) => ({
              single: () =>
                Promise.resolve({
                  data:
                    table === "job_descriptions"
                      ? { id: "jd-test-001" }
                      : { id: "app-fallback-001" },
                  error: null,
                }),
            }),
          };
        },
        async maybeSingle() {
          if (table === "job_descriptions") {
            return {
              data: state.existingJdId ? { id: state.existingJdId } : null,
              error: null,
            };
          }
          if (table === "applications") {
            return {
              data: state.existingAppId ? { id: state.existingAppId } : null,
              error: null,
            };
          }
          return { data: null, error: null };
        },
        async single() {
          return { data: null, error: null };
        },
      };
    },
  };

  return supabase as unknown as Parameters<typeof extractRecruitingLens>[0];
}

function makeLogs() {
  const entries: Array<{ level: string; msg: string; data?: Record<string, unknown> }> = [];
  return {
    entries,
    info: (msg: string, data?: Record<string, unknown>) => entries.push({ level: "info", msg, data }),
    warn: (msg: string, data?: Record<string, unknown>) => entries.push({ level: "warn", msg, data }),
    error: (msg: string, data?: Record<string, unknown>) => entries.push({ level: "error", msg, data }),
  };
}

function makeAnalysisResult(overrides: Partial<{
  id: string;
  user_id: string;
  raw_response: Record<string, unknown> | null;
  primary_score: number | null;
  created_at: string | null;
}> = {}) {
  return {
    id: "analysis-rl-001",
    user_id: "user-001",
    primary_score: 72,
    created_at: new Date().toISOString(),
    raw_response: {
      overallMatch: { score: 72, summary: "Strong candidate" },
      recruiterVerdict: "Good fit for the role",
      criteria: ["5+ years experience", "Python proficiency", "ML background"],
      requiredSkills: ["Python", "TensorFlow", "SQL"],
      preferredSkills: ["Kubernetes", "dbt"],
      topGaps: [
        { title: "Missing Kubernetes experience" },
        { title: "No dbt exposure" },
      ],
      metadata: {
        company: "Acme Corp",
        roleTitle: "ML Engineer",
        jobDescription: "Build ML pipelines...",
      },
    },
    ...overrides,
  };
}

// ── Test cases ─────────────────────────────────────────────────────────────────

Deno.test("extractRecruitingLens: inserts job_descriptions with correct key_requirements count", async () => {
  const supabase = makeMockSupabase({ backfillUpdateCount: 1 });
  const log = makeLogs();
  const result = await extractRecruitingLens(supabase, makeAnalysisResult(), log);

  assertEquals(result.ok, true);
  assertEquals(result.skipped, false);
  assertExists(result.jd_id);

  // @ts-ignore accessing internal state for assertion
  const state = (supabase as any)._state;
  assertEquals(state.jdInsertCalled, true);
  assertExists(state.jdInsertRow);
  assertEquals(
    (state.jdInsertRow!.key_requirements as string[]).length,
    3,
    "should have 3 key requirements from criteria field",
  );
  assertEquals(
    (state.jdInsertRow!.required_skills as string[]).length,
    3,
    "should have 3 required skills",
  );
  assertEquals(state.jdInsertRow!.source_analysis_results_id, "analysis-rl-001");
  assertEquals(state.jdInsertRow!.match_score, 72);
});

Deno.test("extractRecruitingLens: idempotency — second call with same analysis id returns skipped:true", async () => {
  const supabase = makeMockSupabase({ existingJdId: "existing-jd-001" });
  const log = makeLogs();
  const result = await extractRecruitingLens(supabase, makeAnalysisResult(), log);

  assertEquals(result.ok, true);
  assertEquals(result.skipped, true);
  assertEquals(result.jd_id, "existing-jd-001");

  // @ts-ignore
  const state = (supabase as any)._state;
  assertEquals(state.jdInsertCalled, false, "should not insert when already extracted");
  assertEquals(
    log.entries.some((e) => e.msg === "skip-already-extracted-recruiting-lens"),
    true,
  );
});

Deno.test("extractRecruitingLens: applications.jd_id UPDATE call is dispatched", async () => {
  const supabase = makeMockSupabase({ backfillUpdateCount: 1 });
  const log = makeLogs();
  await extractRecruitingLens(supabase, makeAnalysisResult(), log);

  // @ts-ignore
  const state = (supabase as any)._state;
  assertEquals(state.applicationsUpdateCalled, true, "should call update on applications table");
});

Deno.test("extractRecruitingLens: malformed fixture (missing criteria) logs warning and still returns 200", async () => {
  const supabase = makeMockSupabase({ backfillUpdateCount: 1 });
  const log = makeLogs();
  const result = await extractRecruitingLens(
    supabase,
    makeAnalysisResult({
      raw_response: {
        // No criteria, no requiredSkills, no topGaps — fully empty
        overallMatch: { score: 55 },
        metadata: { company: "Acme", roleTitle: "Engineer" },
      },
    }),
    log,
  );

  assertEquals(result.ok, true);
  // Should still insert (with empty arrays) and return jd_id
  assertExists(result.jd_id);

  // Warnings should have been emitted for missing fields
  const warnMsgs = log.entries.filter((e) => e.level === "warn").map((e) => e.msg);
  assertEquals(
    warnMsgs.includes("extract_warning"),
    true,
    "should emit extract_warning for missing fields",
  );
});

Deno.test("extractRecruitingLens: fallback application insert when UPDATE returns 0 rows", async () => {
  // backfillUpdateCount: 0 + no existingAppId → should trigger fallback insert
  const supabase = makeMockSupabase({ backfillUpdateCount: 0, existingAppId: null });
  const log = makeLogs();
  const result = await extractRecruitingLens(supabase, makeAnalysisResult(), log);

  assertEquals(result.ok, true);
  assertExists(result.jd_id);

  // @ts-ignore
  const state = (supabase as any)._state;
  assertEquals(
    state.applicationsInsertCalled,
    true,
    "should insert fallback application when UPDATE rows = 0",
  );
  assertEquals(state.applicationsInsertRow?.application_source, "recruiting_lens");
  assertEquals(state.applicationsInsertRow?.status, "saved");
});
