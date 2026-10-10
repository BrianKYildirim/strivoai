/**
 * Goal Readiness — OFFLINE static-source guard (quick task 260712-msh, Task 3A).
 *
 * Runs inside `deno task test:ci` -> `npm run test:edge` -> `npm run verify:baseline`,
 * with NO network and NO database. It is a static-source audit over the two migration
 * files (the `_shared/cors-audit.test.ts` / `sanitizer-coverage.test.ts` /
 * `no-paddle-live-surface.test.ts` idiom).
 *
 * WHY THIS EXISTS
 *   The Goal Readiness scorer lives in SQL. That buys a structural zero-AI guarantee
 *   and a trigger that cannot be missed by any write path — but SQL is harder to
 *   unit-test than TS. This guard pays that cost down: it FAIL-CLOSES if anyone later
 *   weakens the design, permanently, inside the blocking gate.
 *
 * CRITICAL — SQL COMMENTS ARE STRIPPED BEFORE EVERY ASSERTION.
 *   Both migrations deliberately NAME the banned patterns in their prose ("do NOT use
 *   pg_trigger_depth", "do NOT gate on session_user", "DO NOT copy normalizeFromSections").
 *   A naive `source.includes('pg_trigger_depth')` would therefore match the WARNING
 *   ABOUT the footgun and go red on correct code — or, worse, a future author would
 *   "fix" it by deleting the warning. Assert against CODE, never against prose.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// ── file loading ────────────────────────────────────────────────────────────────
function repoPath(relative: string): string {
  // On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
  // Strip the leading slash (handler-config.test.ts / cors-audit.test.ts idiom).
  const raw = new URL(`../../../${relative}`, import.meta.url).pathname;
  return raw.startsWith('/') && raw[2] === ':' ? raw.slice(1) : raw;
}

function read(relative: string): string {
  // Normalize CRLF -> LF at the read. On a Windows checkout git's autocrlf leaves every
  // line ending in `\r`. JS regex `.` does not match `\r`, so the `--.*$` in code() below
  // can never match on such a line and the comment stripper silently degrades into a
  // NO-OP -- at which point every prose mention of a banned token ("There is no pg_net")
  // reads as real code and the guard fails against files it is documenting, not policing.
  return Deno.readTextFileSync(repoPath(relative)).replace(/\r\n/g, '\n');
}

/** Strip `--` line comments so every assertion below tests CODE, not prose. */
function code(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

const MIGRATION_A_PATH =
  'supabase/migrations/20260712000001_add_professional_goal_and_readiness_columns.sql';
const MIGRATION_B_PATH =
  'supabase/migrations/20260712000002_goal_readiness_scorer_and_triggers.sql';
const MIGRATION_C_PATH =
  'supabase/migrations/20260712000003_fix_career_targets_update_grant.sql';
/**
 * Quick task 260804-50q — the SENTENCE-AWARE replacement body for
 * public.parse_professional_goal(text). It is a CREATE OR REPLACE only: the signature,
 * the language, the volatility and the search_path are unchanged, so
 * compute_goal_readiness needs no edit and the trigger graph is untouched.
 * It is held to the SAME zero-AI / no-write / no-privilege-change bar as Migration B.
 */
const MIGRATION_D_PATH =
  'supabase/migrations/20260804010000_sentence_aware_goal_parsing.sql';
const TAXONOMIES_PATH = 'src/lib/taxonomies.ts';
const PARSER_PATH = 'src/lib/dashboard-intelligence/goal-readiness.ts';

const migrationA = read(MIGRATION_A_PATH);
const migrationB = read(MIGRATION_B_PATH);
const migrationC = read(MIGRATION_C_PATH);
const migrationD = read(MIGRATION_D_PATH);
const codeA = code(migrationA);
const codeB = code(migrationB);
const codeC = code(migrationC);
const codeD = code(migrationD);

/**
 * The EFFECTIVE column-privilege list for `authenticated` on public.career_targets, as
 * the database would hold it after ALL migrations have been applied in order.
 *
 * Grants ACCUMULATE across migrations, so no single file is the source of truth: A
 * revokes the blanket privilege and re-grants a column list, and C adds user_id to the
 * UPDATE list. Reading only A would report a grant list the database does not actually
 * have. Every assertion below therefore runs against the UNION.
 */
function grantedColumns(privilege: 'INSERT' | 'UPDATE'): Set<string> {
  const re = new RegExp(
    `GRANT\\s+${privilege}\\s*\\(([^)]*)\\)\\s*ON\\s+public\\.career_targets\\s+TO\\s+authenticated`,
    'gi',
  );
  const columns = new Set<string>();
  for (const source of [codeA, codeC]) {
    for (const match of source.matchAll(re)) {
      for (const raw of match[1].split(',')) {
        const column = raw.trim();
        if (column) columns.add(column);
      }
    }
  }
  return columns;
}

const GRANTED_INSERT = grantedColumns('INSERT');
const GRANTED_UPDATE = grantedColumns('UPDATE');

const EVIDENCE_TABLES = ['resumes', 'linkedin_grades', 'analysis_results', 'career_targets'] as const;

// ════════════════════════════════════════════════════════════════════════════════
// 1. ZERO AI (CONTEXT §9a/§9b) — the scorer has NO external-call surface at all.
//    This is what makes "Goal Readiness adds zero incremental AI calls and zero
//    incremental token cost" a STRUCTURAL property rather than a promise: plpgsql
//    with no pg_net/http extension literally cannot reach Anthropic.
// ════════════════════════════════════════════════════════════════════════════════
const BANNED_CALL_SURFACE = ['pg_net', 'http_post', 'anthropic', 'net.', 'extensions.http', 'pg_background'];

for (const banned of BANNED_CALL_SURFACE) {
  for (const [path, source] of [[MIGRATION_B_PATH, codeB], [MIGRATION_D_PATH, codeD]] as const) {
    Deno.test(`goal-readiness [zero-AI] ${path} contains no '${banned}' call surface`, () => {
      assertEquals(
        source.toLowerCase().includes(banned.toLowerCase()),
        false,
        `${path} must have NO external-call surface. Found '${banned}'. ` +
          `Goal parsing + Goal Readiness must add ZERO incremental AI calls and ZERO token ` +
          `cost (§9a/§9b). The user's professional_goal is never read by any edge function ` +
          `and must never enter an LLM prompt.`,
      );
    });
  }
}

Deno.test('goal-readiness [zero-AI] no score-goal-alignment edge function was created', () => {
  // §9a explicitly bans it. Its absence is what keeps the user-function count and the
  // AI-ingester count where the two tests below pin them.
  let exists = true;
  try {
    Deno.statSync(repoPath('supabase/functions/score-goal-alignment'));
  } catch {
    exists = false;
  }
  assertEquals(exists, false, 'supabase/functions/score-goal-alignment must NOT exist (§9a).');
});

// ── Counter pins ────────────────────────────────────────────────────────────────
// These two assert "goal parsing / Goal Readiness added NO edge function and NO AI
// ingester". They are the cost proof at the surface-count level.
//
// HISTORY (quick 260804-50q): both were originally written as substring matches for
// `USER_FUNCTIONS.length, 20` and `AI_INGESTERS.length, 5`. Because this whole file was
// never registered in deno.json's `test:ci` task, neither ever ran — and both had gone
// stale: the user-function count is 19 (Paddle retirement + the LinkedIn free-scan
// removal each retired a function AFTER 260712), and sanitizer-coverage.test.ts has no
// `.length` assertion at all, so the substring could never have matched. They are now
// asserted against the FILES' ACTUAL CONTENT rather than against a hardcoded assertion
// string, so they cannot silently rot again. The invariant is unchanged: these numbers
// must not GROW because of goal work.
Deno.test('goal-readiness [zero-AI] cors-audit user-function count is unchanged (no new edge function)', () => {
  const src = Deno.readTextFileSync(new URL('./cors-audit.test.ts', import.meta.url));
  const pinned = src.match(/USER_FUNCTIONS\.length,\s*(\d+)/);
  assert(pinned, 'cors-audit.test.ts must keep pinning USER_FUNCTIONS.length to an exact count.');
  assertEquals(
    Number(pinned![1]),
    19,
    'The user-facing edge-function count moved. Goal parsing and Goal Readiness add NO edge ' +
      'function (§9a) — if this number grew, something in the goal path grew a call surface.',
  );
});

Deno.test('goal-readiness [zero-AI] sanitizer-coverage stays at 5 AI ingesters (no new ingester)', () => {
  const src = Deno.readTextFileSync(new URL('./sanitizer-coverage.test.ts', import.meta.url));
  const block = src.match(/const AI_INGESTERS = \[([\s\S]*?)\]/);
  assert(block, 'sanitizer-coverage.test.ts must declare an AI_INGESTERS array.');
  const ingesters = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assertEquals(
    ingesters.length,
    5,
    `AI_INGESTERS must stay at 5 (${ingesters.join(', ')}). The professional goal is ingested ` +
      `by NOTHING — it is not read by a single edge function, so it never enters an LLM prompt.`,
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// 1b. THE SENTENCE-AWARE PARSER (20260804010000) IS PURELY ADDITIVE.
//     It enriches what parse_professional_goal RETURNS. It must not write a row, must
//     not touch a privilege or the trigger graph, and must not change the function's
//     signature/volatility — compute_goal_readiness is deliberately NOT edited, so the
//     rubric, the weights and the renormalization stay byte-identical and no existing
//     user's score moves.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test('goal-readiness [parser] the sentence-aware migration writes NO rows', () => {
  assertEquals(
    /UPDATE\s+public\.career_targets/i.test(codeD),
    false,
    `${MIGRATION_D_PATH} must not UPDATE career_targets. It only replaces a parsing ` +
      `function body; persistence stays the scorer's job.`,
  );
  assertEquals(
    /INSERT\s+INTO\s+public\.career_targets/i.test(codeD),
    false,
    `${MIGRATION_D_PATH} must not INSERT into career_targets.`,
  );
});

for (const banned of ['GRANT', 'REVOKE', 'ALTER TABLE', 'CREATE TRIGGER']) {
  Deno.test(`goal-readiness [parser] the sentence-aware migration contains no '${banned}'`, () => {
    assertEquals(
      new RegExp(banned.replace(/ /g, '\\s+'), 'i').test(codeD),
      false,
      `${MIGRATION_D_PATH} must be a CREATE OR REPLACE FUNCTION and nothing else. ` +
        `Found '${banned}'. Privileges, tables and the trigger graph are out of scope: ` +
        `CREATE OR REPLACE already preserves the ACL set by ${MIGRATION_B_PATH}.`,
    );
  });
}

Deno.test('goal-readiness [parser] parse_professional_goal returns all 11 documented keys', () => {
  const body = codeD.match(
    /RETURN jsonb_build_object\(([\s\S]*?)\);/i,
  );
  assert(body, `${MIGRATION_D_PATH}: RETURN jsonb_build_object(...) not found.`);
  const keys = body![1];

  // The five LEGACY keys are the back-compat contract with compute_goal_readiness
  // (which reads ->>'role' and ->>'industry') and with GR-09.
  // The six ADDITIVE keys are nullable and every reader must tolerate their absence on
  // rows parsed before this migration.
  for (const key of [
    'role',
    'industry',
    'location',
    'opportunity_type',
    'year',
    'timeframe',
    'seniority',
    'company_type',
    'long_term_direction',
    'normalized_summary',
    'keywords',
  ]) {
    assert(
      keys.includes(`'${key}'`),
      `parse_professional_goal must return the '${key}' key. Dropping a legacy key breaks ` +
        `compute_goal_readiness and GR-09; dropping an additive key breaks the dashboard chip.`,
    );
  }
});

Deno.test('goal-readiness [parser] signature, volatility and search_path are unchanged', () => {
  const fn = codeD.match(
    /CREATE OR REPLACE FUNCTION public\.parse_professional_goal\(p_goal text\)[\s\S]*?AS \$\$/i,
  );
  assert(
    fn,
    `${MIGRATION_D_PATH} must CREATE OR REPLACE public.parse_professional_goal(p_goal text) — ` +
      `a changed signature would orphan compute_goal_readiness's call site.`,
  );
  const header = fn![0];
  assert(/RETURNS jsonb/i.test(header), 'parse_professional_goal must still RETURN jsonb.');
  assert(/LANGUAGE plpgsql/i.test(header), 'parse_professional_goal must stay LANGUAGE plpgsql.');
  assert(/\bSTABLE\b/i.test(header), 'parse_professional_goal must stay STABLE.');
  assert(
    /SET search_path = public/i.test(header),
    'parse_professional_goal must keep SET search_path = public.',
  );
});

Deno.test('goal-readiness [parser] compute_goal_readiness is NOT redefined by the parser migration', () => {
  // Enriching what the parser returns is sufficient. Touching the scorer would move
  // existing users' scores, which quick task 260804-50q explicitly forbids.
  assertEquals(
    /FUNCTION public\.compute_goal_readiness/i.test(codeD),
    false,
    `${MIGRATION_D_PATH} must NOT redefine compute_goal_readiness. The rubric, the weights ` +
      `and the renormalization stay byte-identical.`,
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. TRIGGER COVERAGE — the whole reason this guard exists.
//    Evidence is written from 10+ edge functions AND client code. A missed evidence
//    table means a PERMANENTLY STALE score for every user whose evidence changes only
//    through that table. All four tables must keep BOTH an INSERT and an UPDATE trigger.
// ════════════════════════════════════════════════════════════════════════════════
for (const table of EVIDENCE_TABLES) {
  Deno.test(`goal-readiness [triggers] ${table} has an AFTER INSERT trigger`, () => {
    const re = new RegExp(`CREATE TRIGGER\\s+\\S+\\s+AFTER INSERT ON public\\.${table}\\b`, 'i');
    assert(
      re.test(codeB),
      `public.${table} must have an AFTER INSERT trigger calling tg_goal_readiness(). ` +
        `A missing trigger = a permanently stale Goal Readiness score.`,
    );
  });

  Deno.test(`goal-readiness [triggers] ${table} has an AFTER UPDATE trigger`, () => {
    const re = new RegExp(`CREATE TRIGGER\\s+\\S+\\s+AFTER UPDATE ON public\\.${table}\\b`, 'i');
    assert(
      re.test(codeB),
      `public.${table} must have an AFTER UPDATE trigger calling tg_goal_readiness().`,
    );
  });
}

Deno.test('goal-readiness [triggers] INSERT and UPDATE are SPLIT — no `AFTER INSERT OR UPDATE`', () => {
  // Postgres raises "ERROR: OLD cannot be referenced in ON INSERT trigger" for a
  // combined `AFTER INSERT OR UPDATE ... WHEN (OLD.col IS DISTINCT FROM NEW.col)`.
  // And that WHEN clause IS the recursion guard, so it cannot simply be dropped.
  // The DDL therefore MUST stay split. This assertion stops anyone "tidying" it back.
  assertEquals(
    /AFTER INSERT OR UPDATE/i.test(codeB),
    false,
    'Conditional triggers must be SPLIT into a bare AFTER INSERT plus a separate ' +
      'AFTER UPDATE ... WHEN (...). A combined AFTER INSERT OR UPDATE with a WHEN clause ' +
      'referencing OLD does not compile.',
  );
});

Deno.test('goal-readiness [triggers] recursion guard is the column-scoped WHEN, NOT pg_trigger_depth', () => {
  // pg_trigger_depth() is a footgun here: INSIDE a trigger it is already >= 1, so a
  // `pg_trigger_depth() = 0` condition never fires AT ALL and the score silently never
  // recomputes.
  assertEquals(
    codeB.includes('pg_trigger_depth'),
    false,
    'Do NOT use pg_trigger_depth() as the recursion guard. The column-scoped WHEN clause ' +
      'on the career_targets UPDATE trigger is correct and sufficient.',
  );

  // The career_targets UPDATE trigger MUST carry the column-scoped WHEN clause — that IS
  // the recursion guard. The scorer writes only goal_readiness_* + *_structured, none of
  // which appear in this predicate, so its write-back cannot re-fire the trigger.
  const targetsUpd = codeB.match(
    /CREATE TRIGGER\s+\S+\s+AFTER UPDATE ON public\.career_targets[\s\S]*?EXECUTE FUNCTION/i,
  );
  assert(targetsUpd, 'career_targets AFTER UPDATE trigger not found.');
  const clause = targetsUpd![0];
  assert(/WHEN\s*\(/i.test(clause), 'career_targets AFTER UPDATE trigger MUST carry a WHEN clause.');
  assert(clause.includes('professional_goal'), 'WHEN clause must scope on professional_goal.');
  for (const owned of [
    'goal_readiness_score',
    'goal_readiness_components',
    'goal_readiness_computed_at',
    'professional_goal_structured',
  ]) {
    assertEquals(
      clause.includes(owned),
      false,
      `The career_targets UPDATE WHEN clause must NOT reference ${owned} — the scorer writes ` +
        `it, so including it would make the scorer's own write-back re-fire the trigger.`,
    );
  }
});

Deno.test('goal-readiness [triggers] scorer persists via UPDATE, NEVER an upsert/INSERT', () => {
  // An `INSERT ... ON CONFLICT` would re-fire the UNCONDITIONAL AFTER INSERT trigger on
  // career_targets (which has no WHEN clause and therefore no recursion guard).
  assertEquals(
    /INSERT\s+INTO\s+public\.career_targets/i.test(codeB),
    false,
    'The scorer must persist with UPDATE public.career_targets, never an INSERT.',
  );
  assertEquals(
    /ON CONFLICT/i.test(codeB),
    false,
    'The scorer must not use ON CONFLICT — an upsert defeats the recursion guard.',
  );
  assert(
    /UPDATE\s+public\.career_targets/i.test(codeB),
    'The scorer must persist the score with UPDATE public.career_targets.',
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. RENORMALIZATION (§8d) — un-evidenced components drop from BOTH the numerator
//    AND the denominator. Missing LinkedIn is MISSING DATA, never a silent zero.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test('goal-readiness [renormalization] denominator sums EVIDENCED weights only', () => {
  const filters = codeB.match(/FILTER\s*\(\s*WHERE[^)]*evidenced[^)]*\)/gi) ?? [];
  assert(
    filters.length >= 2,
    'The scorer must compute BOTH the numerator and the denominator with ' +
      "FILTER (WHERE ...evidenced...) — un-evidenced components drop from BOTH. Found " +
      `${filters.length} such FILTER clause(s).`,
  );

  // The denominator must be a FILTERED sum of weights, not a plain sum of all weights.
  // A plain SUM(weight) over every component is precisely what normalizeFromSections
  // (grade-linkedin/schema.ts) does — inapplicable sections there LOWER the achievable
  // ceiling, i.e. exactly the silent missing-LinkedIn penalty this design bans.
  // DO NOT model this on it; there is no repo precedent for true renormalization.
  assert(
    /SUM\(\s*\(c->>'weight'\)::numeric\s*\)\s*\n?\s*FILTER\s*\(\s*WHERE/i.test(codeB),
    'The denominator must be SUM(weight) FILTER (WHERE evidenced), never a plain SUM over ' +
      'all component weights.',
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. TAMPER-RESISTANCE (§9c) — the persisted score is NOT client-writable.
// ════════════════════════════════════════════════════════════════════════════════
const TRIGGER_OWNED_COLUMNS = [
  'goal_readiness_score',
  'goal_readiness_components',
  'goal_readiness_computed_at',
  'professional_goal_structured',
] as const;

Deno.test('goal-readiness [tamper] blanket INSERT/UPDATE on career_targets is REVOKEd from anon + authenticated', () => {
  const revoke = codeA.match(/REVOKE\s+INSERT,\s*UPDATE\s+ON\s+public\.career_targets\s+FROM\s+([^;]+);/i);
  assert(revoke, 'Migration A must REVOKE INSERT, UPDATE ON public.career_targets.');
  const from = revoke![1].toLowerCase();
  assert(from.includes('anon'), 'REVOKE must name anon explicitly.');
  assert(from.includes('authenticated'), 'REVOKE must name authenticated explicitly.');
});

for (const col of TRIGGER_OWNED_COLUMNS) {
  Deno.test(`goal-readiness [tamper] effective GRANT list EXCLUDES ${col}`, () => {
    // RLS gates ROWS, not COLUMNS. Only a column-level GRANT stops a user who legitimately
    // passes the owner-scoped RLS policy from writing `goal_readiness_score = 100` on
    // their OWN row.
    //
    // Checked against the UNION of every migration's grants, so that "just add one more
    // column" in some future corrective migration cannot quietly re-open the hole.
    assert(GRANTED_INSERT.size > 0, 'No GRANT INSERT (cols) ON public.career_targets TO authenticated found.');
    assert(GRANTED_UPDATE.size > 0, 'No GRANT UPDATE (cols) ON public.career_targets TO authenticated found.');
    assertEquals(
      GRANTED_INSERT.has(col),
      false,
      `${col} is TRIGGER-OWNED and must never be client-INSERTable. Effective INSERT grant: ` +
        `${[...GRANTED_INSERT].join(', ')}`,
    );
    assertEquals(
      GRANTED_UPDATE.has(col),
      false,
      `${col} is TRIGGER-OWNED and must never be client-UPDATEable. Effective UPDATE grant: ` +
        `${[...GRANTED_UPDATE].join(', ')}`,
    );
  });
}

// ── The OTHER direction: the grant must not be too TIGHT either. ────────────────
//
// The original 20260712000001 grant list proved that "the score cannot be written" and
// "the goal can be written" are INDEPENDENT properties, and that asserting only the
// first ships a product where NOTHING can be written. Its GRANT UPDATE list omitted
// user_id, so PostgREST's merge-duplicates upsert —
//
//   INSERT INTO career_targets (user_id, ...) VALUES (...)
//   ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, ...
//
// — failed with 42501 for EVERY client write. Postgres checks column privileges at
// execution start, so even the fresh-INSERT path (where no conflict fires) was rejected.
// Onboarding could not save a goal; /dashboard, gated on having one, became permanently
// unreachable. Fixed by 20260712000003. These assertions are why it can't come back.
//
// Every column below is sent by at least one real client upsert:
//   user_id                   — all three (and REQUIRED by DO UPDATE SET user_id = EXCLUDED.user_id)
//   professional_goal         — Onboarding.tsx, useProfessionalGoal.ts (GoalEditDialog)
//   professional_goal_set_at  — Onboarding.tsx, useProfessionalGoal.ts
//   target_roles/_industries  — Onboarding.tsx, Profile.tsx
//   target_companies          — Profile.tsx
//   location_preference       — Profile.tsx
//   career_goals              — Profile.tsx (legacy column, still written)
const CLIENT_WRITABLE_COLUMNS = [
  'user_id',
  'target_roles',
  'target_industries',
  'target_companies',
  'location_preference',
  'career_goals',
  'professional_goal',
  'professional_goal_set_at',
] as const;

for (const col of CLIENT_WRITABLE_COLUMNS) {
  Deno.test(`goal-readiness [tamper] effective GRANT list INCLUDES client-writable ${col}`, () => {
    assert(
      GRANTED_INSERT.has(col),
      `${col} is written by a real client upsert but is NOT in the effective INSERT grant. ` +
        `That write will fail with 42501 permission denied. Effective INSERT grant: ` +
        `${[...GRANTED_INSERT].join(', ')}`,
    );
    assert(
      GRANTED_UPDATE.has(col),
      `${col} is written by a real client upsert but is NOT in the effective UPDATE grant. ` +
        `PostgREST's .upsert({ onConflict: 'user_id' }) emits ON CONFLICT DO UPDATE SET ` +
        `<every sent column> = EXCLUDED.<column>, and Postgres checks column privileges at ` +
        `EXECUTION START — so a missing UPDATE privilege fails the INSERT path too. ` +
        `Effective UPDATE grant: ${[...GRANTED_UPDATE].join(', ')}`,
    );
  });
}

Deno.test('goal-readiness [tamper] user_id is UPDATE-grantable — PostgREST upsert needs it', () => {
  // Called out on its own because it is the single non-obvious one, and the one that
  // actually shipped broken. user_id looks like it should be INSERT-only — it is not:
  // merge-duplicates writes `SET user_id = EXCLUDED.user_id` (a self-assignment no-op)
  // and that requires UPDATE(user_id). Granting it is NOT a row-hijack primitive: the
  // owner-scoped RLS policy (user_id = auth.uid()) still decides WHICH row you may touch,
  // on both the USING and WITH CHECK side.
  assert(
    GRANTED_UPDATE.has('user_id'),
    'GRANT UPDATE on public.career_targets MUST include user_id, or every client upsert ' +
      '(onboarding "Finish Setup", GoalEditDialog, Profile career-targets save) 403s with ' +
      'SQLSTATE 42501 and the goal can never be saved.',
  );
});

Deno.test('goal-readiness [tamper] the blanket privilege is never re-granted', () => {
  // `GRANT UPDATE ON public.career_targets TO authenticated` (no column list) would undo
  // section C entirely and make goal_readiness_score forgeable again. The column list IS
  // the security boundary.
  for (const [path, source] of [[MIGRATION_A_PATH, codeA], [MIGRATION_C_PATH, codeC]] as const) {
    const blanket = /GRANT\s+(?:ALL|INSERT|UPDATE)(?:\s*,\s*(?:INSERT|UPDATE))*\s+ON\s+public\.career_targets/i;
    assertEquals(
      blanket.test(source),
      false,
      `${path} must never GRANT a table-wide INSERT/UPDATE/ALL on public.career_targets — ` +
        `only explicit column lists. A blanket grant re-opens the forgeable-score hole.`,
    );
  }
});

Deno.test('goal-readiness [tamper] does NOT gate on session_user (a no-op under PostgREST)', () => {
  // PostgREST connects as the LOGIN role `authenticator` and then does
  // `SET LOCAL ROLE authenticated`. session_user therefore stays `authenticator` and is
  // NEVER `authenticated`. A `session_user <> 'authenticated'` guard ALWAYS passes —
  // shipping a fully client-writable score while every test still goes green.
  // (Comments are stripped, so the migration's own WARNING about this does not trip it.)
  assertEquals(
    codeA.includes('session_user') || codeB.includes('session_user') || codeD.includes('session_user'),
    false,
    'Never gate the readiness columns on session_user — it is a silent no-op under ' +
      "PostgREST's authenticator -> SET LOCAL ROLE authenticated model. Use column-level GRANTs.",
  );
});

Deno.test('goal-readiness [tamper] compute_goal_readiness EXECUTE revoked from anon AND authenticated', () => {
  // Per project memory: on Supabase, `REVOKE ... FROM public` alone is NOT sufficient —
  // anon and authenticated hold their own default EXECUTE grants.
  const revoke = codeB.match(
    /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.compute_goal_readiness\(uuid\)\s+FROM\s+([^;]+);/i,
  );
  assert(revoke, 'Migration B must REVOKE ALL ON FUNCTION public.compute_goal_readiness(uuid).');
  const from = revoke![1].toLowerCase();
  assert(from.includes('public'), 'REVOKE must name public.');
  assert(from.includes('anon'), 'REVOKE must name anon EXPLICITLY (revoking public is not enough).');
  assert(
    from.includes('authenticated'),
    'REVOKE must name authenticated EXPLICITLY (revoking public is not enough).',
  );
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. TAXONOMY PARITY — the SQL goal_taxonomy seed and the TS list the onboarding UI
//    renders must never drift. Deterministic goal parsing (§9e) is only as good as the
//    taxonomy it parses against.
// ════════════════════════════════════════════════════════════════════════════════
function tsArray(source: string, name: string): string[] {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\n\\];`));
  if (!match) throw new Error(`${name} not found in ${TAXONOMIES_PATH}`);
  return [...match[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
}

function sqlSeed(source: string, kind: 'role' | 'industry'): string[] {
  // Anchor to the INSERT ... VALUES block. Matching the whole file would also pick up
  // the table's `CHECK (kind IN ('role', 'industry'))` constraint and seed a phantom
  // term. (This guard caught exactly that bug in its own first draft.)
  const block = source.match(
    /INSERT INTO public\.goal_taxonomy \(kind, term\) VALUES([\s\S]*?)ON CONFLICT/i,
  );
  if (!block) throw new Error(`goal_taxonomy INSERT ... VALUES block not found in ${MIGRATION_A_PATH}`);
  return [...block[1].matchAll(new RegExp(`\\('${kind}',\\s*'((?:[^']|'')*)'\\)`, 'g'))].map((m) =>
    m[1].replace(/''/g, "'"),
  );
}

const parity: Array<{ kind: 'role' | 'industry'; tsName: string }> = [
  { kind: 'role', tsName: 'ROLE_OPTIONS' },
  { kind: 'industry', tsName: 'INTEREST_OPTIONS' },
];

for (const { kind, tsName } of parity) {
  Deno.test(`goal-readiness [taxonomy] goal_taxonomy '${kind}' seed === ${tsName} (both directions)`, () => {
    const ts = new Set(tsArray(read(TAXONOMIES_PATH), tsName));
    const sql = new Set(sqlSeed(migrationA, kind));

    assert(ts.size > 0, `${tsName} parsed empty — the parser or the file shape changed.`);
    assert(sql.size > 0, `goal_taxonomy '${kind}' seed parsed empty.`);

    const missingInSql = [...ts].filter((t) => !sql.has(t));
    const missingInTs = [...sql].filter((t) => !ts.has(t));

    assertEquals(
      missingInSql,
      [],
      `In ${tsName} but NOT seeded into goal_taxonomy('${kind}'): ${missingInSql.join(', ')}`,
    );
    assertEquals(
      missingInTs,
      [],
      `Seeded into goal_taxonomy('${kind}') but NOT in ${tsName}: ${missingInTs.join(', ')}`,
    );
    assertEquals(ts.size, sql.size, `Entry count drift between ${tsName} and goal_taxonomy('${kind}').`);
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// 6. NO PARALLEL SCORER — the rubric math lives in SQL, ONCE.
//    src/lib/dashboard-intelligence/goal-readiness.ts is a READ-ONLY PARSER of the
//    persisted breakdown. Regrowing the math client-side recreates the dual-implementation
//    drift this whole design exists to eliminate.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test('goal-readiness [no-parallel-scorer] the TS module contains no scoring math', () => {
  let parser: string;
  try {
    parser = read(PARSER_PATH);
  } catch {
    // The file does not exist yet. The invariant ("no scoring math in TS") is trivially
    // satisfied — there is nothing to drift. Once the parser lands, the assertions below
    // acquire teeth and hold it to being a parser forever.
    return;
  }

  const banned: Array<[RegExp, string]> = [
    [/\bweight\s*[:=]\s*\d+/, 'a hardcoded weight CONSTANT (weights live in SQL only)'],
    [/\/\s*100\b/, 'a /100 renormalization expression'],
    [/\.reduce\s*\(/, 'a .reduce( summation (re-deriving the score)'],
    [/Math\.round\s*\(/, 'Math.round( (re-scoring the persisted value)'],
    [/clampScore/, 'a clamp helper (the score is persisted, never re-clamped)'],
  ];

  for (const [re, what] of banned) {
    assertEquals(
      re.test(parser),
      false,
      `${PARSER_PATH} must be a READ-ONLY PARSER. Found ${what}. ` +
        `The Goal Readiness math lives in SQL (compute_goal_readiness), once. ` +
        `Never recompute, re-weight, or "fix" the score client-side.`,
    );
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 7. MONEY-PATH HARDENING — the scorer runs INSIDE the analyze-resume save tail, and
//    `statement_timeout` is NOT caught by `EXCEPTION WHEN OTHERS`. A slow scorer could
//    abort a user's resume save.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test('goal-readiness [money-path] scorer early-returns when the user has no goal', () => {
  const body = codeB.match(
    /CREATE OR REPLACE FUNCTION public\.compute_goal_readiness[\s\S]*?\$\$;/i,
  );
  assert(body, 'compute_goal_readiness not found.');
  const fn = body![0];

  assert(
    /IF NOT FOUND OR v_goal IS NULL OR btrim\(v_goal\) = ''\s+THEN\s+RETURN;/i.test(fn),
    'compute_goal_readiness MUST early-return when the user has no career_targets row or a ' +
      'NULL/blank professional_goal. This is the common case AND it is ALWAYS the case when ' +
      "onboarding's resumes INSERT fires — the resume row lands before the goal is saved.",
  );

  // The early exit must precede the evidence reads, or it buys nothing.
  const guardAt = fn.search(/IF NOT FOUND OR v_goal IS NULL/i);
  const firstEvidenceAt = fn.search(/FROM public\.resumes/i);
  assert(guardAt > 0 && firstEvidenceAt > 0, 'Could not locate the guard / the first evidence read.');
  assert(
    guardAt < firstEvidenceAt,
    'The no-goal early exit must come BEFORE the evidence reads.',
  );
});

Deno.test('goal-readiness [money-path] scoring failure can never abort the evidence write', () => {
  const body = codeB.match(
    /CREATE OR REPLACE FUNCTION public\.compute_goal_readiness[\s\S]*?\$\$;/i,
  )![0];
  assert(
    /EXCEPTION\s+WHEN\s+OTHERS\s+THEN/i.test(body),
    'compute_goal_readiness must swallow its own failures — a failed recompute may not lose a ' +
      "user's resume analysis. The score simply goes stale.",
  );
});

for (const index of ['idx_resumes_user_created', 'idx_analysis_results_user_type_created']) {
  Deno.test(`goal-readiness [money-path] migration A creates ${index}`, () => {
    const re = new RegExp(`CREATE INDEX IF NOT EXISTS ${index}\\b`, 'i');
    assert(
      re.test(codeA),
      `${index} backs one of the scorer's "latest row" lookups. Without it a seq-scan inside ` +
        `the analyze-resume save tail could trip statement_timeout and abort a resume save.`,
    );
  });
}
