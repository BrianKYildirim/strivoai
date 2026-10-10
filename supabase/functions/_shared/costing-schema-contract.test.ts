import {
  assert,
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const FOUNDATION_URL = new URL(
  "../../migrations/20260801010000_costing_telemetry_foundation.sql",
  import.meta.url,
);
const RETENTION_URL = new URL(
  "../../migrations/20260801010001_costing_telemetry_retention_reporting.sql",
  import.meta.url,
);
const FOUNDATION_ROLLBACK_URL = new URL(
  "../../migrations/rollback/20260801010000_costing_telemetry_foundation.rollback.sql",
  import.meta.url,
);
const RETENTION_ROLLBACK_URL = new URL(
  "../../migrations/rollback/20260801010001_costing_telemetry_retention_reporting.rollback.sql",
  import.meta.url,
);

function normalized(source: string): string {
  return source.replace(/\s+/g, " ").toLowerCase();
}

async function read(url: URL): Promise<string> {
  return await Deno.readTextFile(url);
}

Deno.test("costing schema D-05..D-08: extends the single AI ledger and preserves legacy rows", async () => {
  const sql = normalized(await read(FOUNDATION_URL));

  for (
    const table of [
      "costing_subjects",
      "costing_account_classifications",
      "provider_pricing",
      "feature_runs",
      "document_processing_runs",
    ]
  ) {
    assertMatch(sql, new RegExp(`create table if not exists public\\.${table}\\b`));
  }

  assertMatch(sql, /alter table public\.ai_call_telemetry/);
  assert(!/create table(?: if not exists)? public\.ai_calls\b/.test(sql));
  assertMatch(sql, /add column if not exists feature_run_id uuid null/);
  assertMatch(sql, /add column if not exists costing_epoch text null/);
}
);

Deno.test("costing schema D-09..D-13: pricing is append-only and unknown cost stays explicit", async () => {
  const sql = normalized(await read(FOUNDATION_URL));

  assertMatch(sql, /provider_pricing_no_overlap/);
  assertMatch(sql, /prevent_provider_pricing_mutation/);
  assertMatch(sql, /revoke update, delete on public\.provider_pricing/);
  assertMatch(sql, /provider_reported_cost_usd numeric(?:\([^)]*\))? null/);
  assertMatch(sql, /calculated_cost_usd numeric(?:\([^)]*\))? null/);
  assertMatch(sql, /cost_known boolean/);
  assertMatch(sql, /cost_confidence text/);
  assertMatch(sql, /ai_call_telemetry_id bigint null/);
  assertMatch(sql, /document_cost_excludes_referenced_ai/);
  assert(
    !/coalesce\s*\([^)]*(?:incurred|reported|calculated)_cost[^)]*,\s*0/.test(sql),
    "unknown provider cost must not be coerced to zero",
  );
});

Deno.test("costing schema D-14/D-15: all costing surfaces are service-role-only", async () => {
  const foundation = normalized(await read(FOUNDATION_URL));
  const retention = normalized(await read(RETENTION_URL));
  const newTables = [
    "costing_subjects",
    "costing_account_classifications",
    "provider_pricing",
    "feature_runs",
    "document_processing_runs",
  ];

  for (const table of newTables) {
    assertMatch(foundation, new RegExp(`alter table public\\.${table} enable row level security`));
    assertMatch(
      foundation,
      new RegExp(`revoke all on public\\.${table} from anon, authenticated`),
    );
  }

  for (
    const view of [
      "costing_monthly_product_mau",
      "costing_monthly_feature_usage",
      "costing_monthly_ai_usage",
      "costing_monthly_document_usage",
    ]
  ) {
    assertMatch(retention, new RegExp(`create or replace view public\\.${view}`));
    assertMatch(retention, new RegExp(`revoke all on public\\.${view} from anon, authenticated`));
  }

  assertMatch(retention, /environment = 'production'/);
  assertMatch(retention, /exclude_from_costing_at_time = false/);
  assertMatch(retention, /costing_epoch = 'phase_04_2_complete'/);
});

Deno.test("costing schema D-16/D-17: deletion detaches identity and retention is bounded", async () => {
  const sql = normalized(await read(RETENTION_URL));

  assertMatch(sql, /create or replace function public\.handle_auth_user_deleted\(\)/);
  assertMatch(sql, /update public\.costing_subjects set auth_user_id = null/);
  assertMatch(sql, /update public\.feature_runs set user_id = null/);
  assertMatch(sql, /update public\.ai_call_telemetry set user_id = null/);
  assertMatch(sql, /update public\.document_processing_runs set user_id = null/);
  assertMatch(sql, /interval '24 months'/);
  assertMatch(sql, /interval '5 years'/);
  assertMatch(sql, /create or replace function public\.rollup_and_prune_costing_telemetry/);
  assertMatch(sql, /cron\.unschedule/);
  assertMatch(sql, /cron\.schedule/);
  assertMatch(sql, /count\(distinct fr\.costing_subject_id\)/);
});

Deno.test("costing schema rollback files remove only Phase 04.2 artifacts", async () => {
  const foundation = normalized(await read(FOUNDATION_ROLLBACK_URL));
  const retention = normalized(await read(RETENTION_ROLLBACK_URL));

  assertMatch(foundation, /drop table if exists public\.document_processing_runs/);
  assertMatch(foundation, /alter table public\.ai_call_telemetry/);
  assertMatch(retention, /drop function if exists public\.rollup_and_prune_costing_telemetry/);
  assert(
    !foundation.includes("drop table if exists public.ai_call_telemetry"),
    "rollback must preserve the Phase 02 AI ledger",
  );
});

Deno.test("costing schema files stay free of user content columns", async () => {
  const source = `${await read(FOUNDATION_URL)}\n${await read(RETENTION_URL)}`;
  const forbidden = [
    "prompt_text",
    "response_text",
    "document_text",
    "resume_text",
    "email_address",
    "payment_details",
  ];

  assertEquals(forbidden.filter((column) => source.includes(column)), []);
});

// ── The gate that was missing on 2026-08-01 ─────────────────────────────────────────────
//
// The foundation migration shipped `format('CREATE POLICY "Service role only - %" ...')`.
// `%` immediately followed by `"` is not a valid format() specifier, so Postgres raised
// `unrecognized format() type specifier` (SQLSTATE 22023) and the whole migration rolled
// back on the FIRST real `supabase db push`.
//
// Nothing in this repo caught it, and nothing could have: `type-check` never reads SQL and
// `test:edge` never executes SQL against a live Postgres. The defect was only reachable at
// deploy time, which is the most expensive place to find it.
//
// This is the cheap, bounded, offline check that closes that gap. It does not parse SQL and
// it does not need a database -- it extracts the template literal of every `format(` call in
// the Phase 04.2 migrations and asserts each `%` is followed by a valid specifier.
//
// Valid per the Postgres docs: %s (string), %I (identifier), %L (literal), %% (escape), and
// the positional `%n$s` forms. Anything else is a runtime error waiting for a deploy.
Deno.test("costing schema: every format() specifier in the Phase 04.2 migrations is valid", async () => {
  const files: Array<[string, URL]> = [
    ["foundation", FOUNDATION_URL],
    ["retention", RETENTION_URL],
    ["foundation rollback", FOUNDATION_ROLLBACK_URL],
    ["retention rollback", RETENTION_ROLLBACK_URL],
  ];

  // Matches the single-quoted template that is format()'s first argument. Doubled quotes
  // ('') are SQL's escape for a literal quote and stay inside the template.
  const formatCall = /\bformat\(\s*'((?:[^']|'')*)'/gi;
  // A specifier is %% or %[position$]type where type is one of s / I / L.
  const specifier = /%(?:%|\d+\$?[sIL]|[sIL])/g;

  let inspected = 0;
  for (const [label, url] of files) {
    const source = await read(url);
    for (const call of source.matchAll(formatCall)) {
      inspected += 1;
      const template = call[1];
      // Blank out every VALID specifier, then any surviving '%' is malformed.
      const residue = template.replace(specifier, "");
      const bad = residue.indexOf("%");
      assertEquals(
        bad,
        -1,
        `${label}: malformed format() specifier near "${residue.slice(Math.max(0, bad - 20), bad + 20)}" ` +
          `in template: ${template}. Valid specifiers are %s, %I, %L, %% and their %n$ forms. ` +
          "An invalid one raises SQLSTATE 22023 at DEPLOY time and rolls the migration back.",
      );
    }
  }

  assert(
    inspected > 0,
    "This guard found no format() calls to inspect. Either the migrations changed shape or " +
      "the extraction regex broke -- a guard that inspects nothing is worse than no guard.",
  );
});

Deno.test("costing schema: the service-role policy loop names one policy per table", async () => {
  const sql = await read(FOUNDATION_URL);

  // The exact defect, restated as a positive contract: the policy NAME is %s (it sits inside
  // the template's own double quotes) and the RELATION is %I (properly quoted identifier).
  assertMatch(
    sql,
    /'CREATE POLICY "Service role only - %s" ON public\.%I FOR ALL TO authenticated USING \(false\) WITH CHECK \(false\)'/,
  );
  assert(
    !/"Service role only - %"/.test(sql),
    'The policy template must not use a bare "%": it is not a valid format() specifier.',
  );
});
