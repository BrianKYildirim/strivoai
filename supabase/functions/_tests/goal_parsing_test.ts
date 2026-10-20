/**
 * Sentence-aware goal parsing — GATED-REMOTE proofs (quick task 260804-50q).
 *
 * These run the REAL plpgsql `public.parse_professional_goal()` on a real Postgres, through
 * the same write path the client uses. They cannot be faked: the parse, the trigger and the
 * column grants are all engine behaviour.
 *
 * ZERO AI, AND PROVABLY SO. Nothing in this file — or in anything it exercises — calls a
 * model. `professional_goal` is not read by a single edge function (`rg professional_goal
 * supabase/functions` returns only test files and the generated database types), so the
 * user's goal text never enters an LLM prompt at all. Enriching the parse therefore adds
 * ZERO incremental AI calls and ZERO incremental tokens.
 *
 * Follows the `_tests/goal_readiness_test.ts` / `_tests/merit_rls_test.ts` idiom exactly:
 * env-gated, SELF-SKIPS with a clear message when the remote env is absent, so registering
 * it in deno.json keeps it DISCOVERABLE without turning the offline gate red.
 *
 * Prerequisites (preview / TEST project — NEVER production):
 *   DENO_TEST_SUPABASE_REMOTE=1
 *   SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_ANON_KEY
 *
 * Run with:
 *   DENO_TEST_SUPABASE_REMOTE=1 deno test supabase/functions/_tests/goal_parsing_test.ts \
 *     --no-check --allow-env --allow-net
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const REMOTE = Deno.env.get('DENO_TEST_SUPABASE_REMOTE') === '1';
const URL_ = Deno.env.get('SUPABASE_TEST_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_TEST_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_TEST_ANON_KEY') ?? '';

const hasPrereqs = REMOTE && !!URL_ && !!SERVICE_KEY && !!ANON_KEY;

// See merit_rls_test.ts: supabase-js v2 spins an uncleanable GoTrue refresh interval, so
// Deno's default leak sanitizer flags every test as FAILED even when the assertions pass.
const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

function admin(): SupabaseClient {
  return createClient(URL_, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── the fixtures, one per required scenario ─────────────────────────────────────
/** 1. SHORT PHRASE — the format the original 5-key parser was tuned for. */
const GOAL_PHRASE = 'Investment Banking Internship — NYC 2027';

/**
 * 2. THE BACK-COMPAT CONTRACT. `_tests/goal_readiness_test.ts` GR-09 pins this exact
 *    string's five legacy values. They must NEVER be "improved".
 */
const GOAL_LEGACY = 'IB internship 2027 in New York — Investment Banking';

/** 3. ONE conversational sentence — how people actually write. */
const GOAL_ONE_SENTENCE =
  'I want to secure an investment banking internship in New York in 2027, ideally at a leading global bank.';

/** 4. TWO sentences: the immediate goal plus a later ambition. */
const GOAL_TWO_SENTENCES =
  `${GOAL_ONE_SENTENCE} I want to build the experience needed to move into private equity later.`;

/** 5. NO optional detail at all. Must parse, must not guess, must not throw. */
const GOAL_BARE = 'I want a job.';

type Structured = {
  role: string | null;
  industry: string | null;
  location: string | null;
  opportunity_type: string | null;
  year: string | null;
  timeframe?: string | null;
  seniority?: string | null;
  company_type?: string | null;
  long_term_direction?: string | null;
  normalized_summary?: string | null;
  keywords?: string[] | null;
};

type Component = { id: string; label: string; weight: number; score: number; evidenced: boolean };

async function createUser(email: string, password: string): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data?.user?.id) throw new Error(`createUser failed: ${error?.message}`);
  return data.user.id;
}

async function destroyUser(userId: string): Promise<void> {
  const a = admin();
  await a.from('linkedin_grades').delete().eq('user_id', userId);
  await a.from('analysis_results').delete().eq('user_id', userId);
  await a.from('career_targets').delete().eq('user_id', userId);
  await a.from('resumes').delete().eq('user_id', userId);
  await a.auth.admin.deleteUser(userId);
}

const RESUME_GRADING = {
  strengths: [
    'Led an Investment Banking deal team through a $2.1M transaction',
    'Built DCF and LBO valuation models in Excel',
  ],
  priorityImprovements: ['Add more quantified outcomes to the internship bullets'],
  suggestedTargetRoles: ['Investment Banking Analyst'],
  industryGuess: 'Finance',
};

async function seedResume(userId: string, score = 78): Promise<void> {
  const { error } = await admin().from('resumes').insert({
    user_id: userId,
    file_name: 'goal-parsing-fixture.pdf',
    file_url: 'seed://goal-parsing',
    file_size: 2048,
    overall_score: score,
    grading_data: RESUME_GRADING,
  });
  if (error) throw new Error(`seedResume failed: ${error.message}`);
}

/** Saves the goal EXACTLY as the client does — the trigger parses in this same write. */
async function saveGoal(userId: string, goal: string): Promise<void> {
  const { error } = await admin()
    .from('career_targets')
    .upsert(
      {
        user_id: userId,
        professional_goal: goal,
        professional_goal_set_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`saveGoal failed: ${error.message}`);
}

async function readGoal(
  userId: string,
): Promise<{ raw: string; structured: Structured | null; score: number | null; components: unknown }> {
  const { data, error } = await admin()
    .from('career_targets')
    .select(
      'professional_goal, professional_goal_structured, goal_readiness_score, goal_readiness_components',
    )
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`readGoal failed: ${error.message}`);
  return {
    raw: data!.professional_goal as string,
    structured: data!.professional_goal_structured as unknown as Structured | null,
    score: data!.goal_readiness_score as number | null,
    components: data!.goal_readiness_components,
  };
}

/** Save a goal on a throwaway user and return its parse. */
async function parseOf(prefix: string, goal: string): Promise<Structured> {
  const uid = await createUser(`${prefix}+${crypto.randomUUID()}@strivo.test`, crypto.randomUUID());
  try {
    await saveGoal(uid, goal);
    const { raw, structured } = await readGoal(uid);
    assertEquals(raw, goal, 'the raw goal must survive the parse byte-identically');
    assert(structured !== null, `a structured form must be derived for ${JSON.stringify(goal)}`);
    return structured!;
  } finally {
    await destroyUser(uid);
  }
}

function skip(name: string): boolean {
  if (!hasPrereqs) {
    console.warn(
      `[SKIP] ${name} — needs DENO_TEST_SUPABASE_REMOTE=1 + SUPABASE_TEST_URL + ` +
        `SUPABASE_TEST_SERVICE_ROLE_KEY + SUPABASE_TEST_ANON_KEY (preview project).`,
    );
    return true;
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════════════
// GP-01 — SCENARIO 1: a SHORT PHRASE still parses, and now also carries the
//         additive display/keyword signals.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GP-01: a short phrase goal parses to the legacy signals plus a summary and keywords',
  ...testOpts,
  fn: async () => {
    if (skip('GP-01')) return;
    const s = await parseOf('gp01', GOAL_PHRASE);

    assertEquals(s.role, 'Investment Banking');
    assertEquals(s.opportunity_type, 'internship');
    assertEquals(s.year, '2027');
    // "NYC" is not capitalized-after-a-preposition, so location stays NULL. The parser
    // NEVER guesses — exactly as before this change.
    assertEquals(s.location, null);

    assert(
      typeof s.normalized_summary === 'string' && s.normalized_summary.trim().length > 0,
      `normalized_summary must be a non-empty string, got ${JSON.stringify(s.normalized_summary)}`,
    );
    assert(Array.isArray(s.keywords) && s.keywords.length > 0, 'keywords must be a non-empty array');
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// GP-02 — SCENARIO 5 (part 1): THE BACK-COMPAT CONTRACT.
//
//   These four values are pinned IDENTICALLY by goal_readiness_test.ts GR-09. They are
//   what every already-saved goal parsed to before this migration, and what
//   compute_goal_readiness scores against. THIS TEST MUST NEVER BE "IMPROVED" — changing
//   any of them silently moves every existing user's Goal Readiness score.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GP-02: the five legacy keys are byte-identical to the pre-migration parser',
  ...testOpts,
  fn: async () => {
    if (skip('GP-02')) return;
    const s = await parseOf('gp02', GOAL_LEGACY);

    assertEquals(s.year, '2027');
    assertEquals(s.opportunity_type, 'internship');
    assertEquals(s.location, 'New York');
    assertEquals(s.role, 'Investment Banking'); // longest taxonomy match
    assertEquals(s.industry, 'Investment Banking');
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// GP-03 — SCENARIO 2: ONE CONVERSATIONAL SENTENCE.
//         Includes the actual bug fix: a taxonomy term can no longer be read as a place.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GP-03: a one-sentence goal yields a real location, company type, opportunity and year',
  ...testOpts,
  fn: async () => {
    if (skip('GP-03')) return;
    const s = await parseOf('gp03', GOAL_ONE_SENTENCE);

    assertEquals(s.location, 'New York');
    // THE FIX: nothing used to stop a goal_taxonomy term being captured as the location.
    assert(
      s.location !== 'Investment Banking' && s.location !== 'Private Equity',
      `a taxonomy term must never be captured as a location. Got ${JSON.stringify(s.location)}`,
    );
    assertEquals(s.company_type, 'leading global bank');
    assertEquals(s.opportunity_type, 'internship');
    assertEquals(s.year, '2027');
    assertEquals(s.role, 'Investment Banking');
    assert(s.timeframe !== null && s.timeframe !== undefined, 'timeframe must be populated');
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// GP-04 — SCENARIO 3: TWO SENTENCES. The later-ambition clause is captured VERBATIM
//         and its domain terms reach `keywords`.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GP-04: a two-sentence goal additionally yields long_term_direction and its keywords',
  ...testOpts,
  fn: async () => {
    if (skip('GP-04')) return;
    const s = await parseOf('gp04', GOAL_TWO_SENTENCES);

    // Everything GP-03 proves still holds when a second sentence is present.
    assertEquals(s.location, 'New York');
    assertEquals(s.company_type, 'leading global bank');
    assertEquals(s.opportunity_type, 'internship');
    assertEquals(s.year, '2027');
    assertEquals(s.role, 'Investment Banking');

    const direction = s.long_term_direction;
    assert(
      typeof direction === 'string' && direction.trim().length > 0,
      `long_term_direction must be a non-empty string, got ${JSON.stringify(direction)}`,
    );
    assert(
      /private equity/i.test(direction as string),
      `long_term_direction must quote the user's own later-ambition clause. Got ${JSON.stringify(direction)}`,
    );

    assert(Array.isArray(s.keywords), 'keywords must be an array');
    assert(
      (s.keywords as string[]).includes('private equity'),
      `keywords must carry the long-term direction's domain terms. Got ${JSON.stringify(s.keywords)}`,
    );
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// GP-05 — SCENARIO 4: NO OPTIONAL DETAILS. Never an exception, never a guess.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GP-05: a goal with no optional details parses to nulls without error — nothing is guessed',
  ...testOpts,
  fn: async () => {
    if (skip('GP-05')) return;
    const s = await parseOf('gp05', GOAL_BARE);

    assertEquals(s.location, null, 'no location was stated, so none may be invented');
    assertEquals(s.company_type, null);
    assertEquals(s.long_term_direction, null);
    assertEquals(s.year, null);
    assertEquals(s.opportunity_type, null);

    // keywords is ALWAYS an array — '[]'::jsonb when empty, never SQL NULL.
    assert(
      Array.isArray(s.keywords),
      `keywords must always be an array (empty is fine), got ${JSON.stringify(s.keywords)}`,
    );
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// GP-06 — THE USER'S WORDING IS SACRED, newlines included.
//         Nothing derived is ever written back into professional_goal.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GP-06: a multi-line goal is byte-identical after the trigger runs',
  ...testOpts,
  fn: async () => {
    if (skip('GP-06')) return;
    const MULTILINE =
      'I want an investment banking internship in New York in 2027.\nEventually I want to move into private equity.';
    const uid = await createUser(`gp06+${crypto.randomUUID()}@strivo.test`, crypto.randomUUID());
    try {
      await saveGoal(uid, MULTILINE);
      const { raw, structured } = await readGoal(uid);

      assertEquals(raw, MULTILINE, "the user's wording, INCLUDING the newline, must survive verbatim");
      assert(raw.includes('\n'), 'the newline itself must not have been normalized away');

      // The derived label exists but is NEVER the stored goal.
      assert(structured !== null);
      assert(
        structured!.normalized_summary !== raw,
        'normalized_summary is a display label and must never replace the raw goal',
      );
      assert(
        /private equity/i.test(String(structured!.long_term_direction ?? '')),
        'the second line must still be recognised as the long-term direction',
      );
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// GP-07 — SCENARIO 5 (part 2): AN EXISTING SAVED GOAL.
//   A row persisted BEFORE this migration carries only the 5 legacy keys. It must keep
//   working, and it must be upgraded IN PLACE on the next recompute — with the raw goal
//   untouched and the score still produced.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GP-07: a legacy 5-key row still scores and is upgraded in place to 11 keys',
  ...testOpts,
  fn: async () => {
    if (skip('GP-07')) return;
    const uid = await createUser(`gp07+${crypto.randomUUID()}@strivo.test`, crypto.randomUUID());
    try {
      await seedResume(uid);
      await saveGoal(uid, GOAL_LEGACY);

      // Force the row back to its PRE-MIGRATION shape. service_role bypasses the column
      // grants; professional_goal_structured is not in the career_targets UPDATE trigger's
      // WHEN predicate, so this write cannot re-fire the scorer and undo itself.
      const legacyShape = {
        role: 'Investment Banking',
        industry: 'Investment Banking',
        location: 'New York',
        opportunity_type: 'internship',
        year: '2027',
      };
      const { error: downgradeErr } = await admin()
        .from('career_targets')
        .update({ professional_goal_structured: legacyShape })
        .eq('user_id', uid);
      assertEquals(downgradeErr, null);

      const legacy = await readGoal(uid);
      assertEquals(
        Object.keys(legacy.structured as unknown as Record<string, unknown>).sort(),
        ['industry', 'location', 'opportunity_type', 'role', 'year'],
        'the fixture must actually be in the legacy 5-key shape',
      );
      assert(legacy.score !== null, 'a legacy row must still carry a score');

      // Any evidence write recomputes. service_role retains EXECUTE on the scorer.
      const { error: rpcErr } = await admin().rpc('compute_goal_readiness', { p_user_id: uid });
      assertEquals(rpcErr, null, 'service_role must be able to invoke the scorer');

      const upgraded = await readGoal(uid);
      assertEquals(
        Object.keys(upgraded.structured as unknown as Record<string, unknown>).sort(),
        [
          'company_type',
          'industry',
          'keywords',
          'location',
          'long_term_direction',
          'normalized_summary',
          'opportunity_type',
          'role',
          'seniority',
          'timeframe',
          'year',
        ],
        'the row must be upgraded in place to the full 11-key shape',
      );

      // The five legacy values are unchanged by the upgrade.
      assertEquals(upgraded.structured!.role, legacyShape.role);
      assertEquals(upgraded.structured!.industry, legacyShape.industry);
      assertEquals(upgraded.structured!.location, legacyShape.location);
      assertEquals(upgraded.structured!.opportunity_type, legacyShape.opportunity_type);
      assertEquals(upgraded.structured!.year, legacyShape.year);

      assertEquals(upgraded.raw, GOAL_LEGACY, 'the raw goal must be untouched by the upgrade');
      assert(upgraded.score !== null, 'the upgraded row must still score');
      assertEquals(upgraded.score, legacy.score, 'the enrichment must not move the score');
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// GP-08 — THE RUBRIC IS UNTOUCHED.
//   compute_goal_readiness is deliberately NOT edited by 20260804010000, and `keywords` is
//   deliberately NOT fed into its term set. This pins "the enrichment moved nobody's score".
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GP-08: the rubric still has exactly its 6 components with their original weights',
  ...testOpts,
  fn: async () => {
    if (skip('GP-08')) return;
    const uid = await createUser(`gp08+${crypto.randomUUID()}@strivo.test`, crypto.randomUUID());
    try {
      await seedResume(uid);
      await saveGoal(uid, GOAL_LEGACY);

      const { components } = await readGoal(uid);
      const rows = (components as { components: Component[] }).components;
      assert(Array.isArray(rows), 'goal_readiness_components.components must be an array');

      assertEquals(
        rows.map((c) => [c.id, c.weight]),
        [
          ['resume_quality', 25],
          ['goal_alignment', 25],
          ['goal_keyword_coverage', 15],
          ['linkedin_strength', 15],
          ['evidence_depth', 10],
          ['profile_consistency', 10],
        ],
        'the rubric ids, their ORDER and their weights must be byte-identical to 20260712000002. ' +
          'Sentence-aware parsing enriches what the parser RETURNS; it must never re-weight ' +
          'anything or feed `keywords` into the scorer, or every existing user\'s score moves.',
      );
      assertEquals(
        rows.reduce((sum, c) => sum + c.weight, 0),
        100,
        'the rubric weights must still sum to 100',
      );
    } finally {
      await destroyUser(uid);
    }
  },
});
