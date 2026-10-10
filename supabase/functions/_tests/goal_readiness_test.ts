/**
 * Goal Readiness — GATED-REMOTE rubric proofs (quick task 260712-msh, Task 3B).
 *
 * These prove the RUBRIC'S PROPERTIES against the REAL plpgsql scorer on a real
 * Postgres. They cannot be faked: renormalization, trigger coverage, owner-scoping and
 * non-writability are all engine behaviour, not application behaviour.
 *
 * Follows the `_tests/merit_rls_test.ts` idiom exactly: env-gated, SELF-SKIPS with a
 * clear message when the remote env is absent. `npm run test:edge` pins
 * DENO_TEST_SUPABASE_REMOTE=0, so registering this in deno.json keeps it DISCOVERABLE
 * without turning the offline gate red.
 *
 * Prerequisites (preview / TEST project — NEVER production):
 *   DENO_TEST_SUPABASE_REMOTE=1
 *   SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_ANON_KEY
 *
 * Run with:
 *   DENO_TEST_SUPABASE_REMOTE=1 deno test supabase/functions/_tests/goal_readiness_test.ts \
 *     --no-check --allow-env --allow-net
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const REMOTE = Deno.env.get('DENO_TEST_SUPABASE_REMOTE') === '1';
const URL_ = Deno.env.get('SUPABASE_TEST_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_TEST_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_TEST_ANON_KEY') ?? '';

const hasPrereqs = REMOTE && !!URL_ && !!SERVICE_KEY && !!ANON_KEY;

// See merit_rls_test.ts: supabase-js v2 spins an uncleanable GoTrue refresh interval,
// so Deno's default leak sanitizer flags every test as FAILED even when the assertions pass.
const testOpts = { sanitizeOps: false, sanitizeResources: false } as const;

function admin(): SupabaseClient {
  return createClient(URL_, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── rubric constants, mirrored from the SQL ONLY to compute the "what the buggy
//    alternative would have produced" comparison inline. NOT a parallel scorer.
const WEIGHTS: Record<string, number> = {
  resume_quality: 25,
  goal_alignment: 25,
  goal_keyword_coverage: 15,
  linkedin_strength: 15,
  evidence_depth: 10,
  profile_consistency: 10,
};
const TOTAL_WEIGHT = 100;

type Component = { id: string; label: string; weight: number; score: number; evidenced: boolean };
type Breakdown = {
  components: Component[];
  interpretation: string;
  partial_evidence: boolean;
  evidenced_weight: number;
  blockers: string[];
};

// ── deterministic fixture content ───────────────────────────────────────────────
const GOAL_RAW = 'IB internship 2027 in New York — Investment Banking';

/** A resume whose evidence clearly supports an Investment Banking / Finance goal. */
const RESUME_GRADING = {
  strengths: [
    'Led an Investment Banking deal team through a $2.1M transaction',
    'Built DCF and LBO valuation models in Excel',
    'Quantified transaction impact across three Finance workstreams',
  ],
  priorityImprovements: ['Add more quantified outcomes to the internship bullets'],
  suggestedTargetRoles: ['Investment Banking Analyst', 'Financial Analysis'],
  industryGuess: 'Finance',
};

/**
 * A LinkedIn profile whose section strengths deliberately share FEW tokens with the
 * resume above (volunteering / photography / community, not banking / valuation /
 * finance). This PINS the intentional-drop fixture: adding LinkedIn evidences BOTH
 * linkedin_strength AND profile_consistency at the same moment, so without controlling
 * the overlap the drop assertion would be fixture-dependent.
 */
const LINKEDIN_GRADING_LOW_OVERLAP = {
  keyStrengths: [
    'Volunteer coordination for a local shelter',
    'Photography portfolio and darkroom printing',
    'Community outreach and event hosting',
  ],
};

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
  // linkedin_grades.user_id has NO ON DELETE CASCADE — clear it explicitly first.
  await a.from('linkedin_grades').delete().eq('user_id', userId);
  await a.from('analysis_results').delete().eq('user_id', userId);
  await a.from('career_targets').delete().eq('user_id', userId);
  await a.from('resumes').delete().eq('user_id', userId);
  await a.auth.admin.deleteUser(userId);
}

async function seedResume(userId: string, score: number): Promise<string> {
  const { data, error } = await admin()
    .from('resumes')
    .insert({
      user_id: userId,
      file_name: 'goal-readiness-fixture.pdf',
      file_url: 'seed://goal-readiness',
      file_size: 2048,
      overall_score: score,
      grading_data: RESUME_GRADING,
    })
    .select('id')
    .single();
  if (error) throw new Error(`seedResume failed: ${error.message}`);
  return data!.id as string;
}

/** Saves the goal exactly as the client does — the trigger recomputes in this same write. */
async function saveGoal(userId: string, goal = GOAL_RAW): Promise<void> {
  const { error } = await admin()
    .from('career_targets')
    .upsert(
      {
        user_id: userId,
        target_roles: ['Investment Banking'],
        target_industries: ['Finance'],
        professional_goal: goal,
        professional_goal_set_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`saveGoal failed: ${error.message}`);
}

async function readReadiness(
  userId: string,
): Promise<{ score: number | null; breakdown: Breakdown; computedAt: string | null; rawGoal: string }> {
  const { data, error } = await admin()
    .from('career_targets')
    .select(
      'professional_goal, goal_readiness_score, goal_readiness_components, goal_readiness_computed_at',
    )
    .eq('user_id', userId)
    .single();
  if (error) throw new Error(`readReadiness failed: ${error.message}`);
  return {
    score: data!.goal_readiness_score as number | null,
    breakdown: data!.goal_readiness_components as unknown as Breakdown,
    computedAt: data!.goal_readiness_computed_at as string | null,
    rawGoal: data!.professional_goal as string,
  };
}

const component = (b: Breakdown, id: string): Component => {
  const c = b.components.find((x) => x.id === id);
  if (!c) throw new Error(`component ${id} missing from the persisted breakdown`);
  return c;
};

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

const uniq = () => crypto.randomUUID();

// ════════════════════════════════════════════════════════════════════════════════
// 1. MISSING LINKEDIN RENORMALIZES — IT IS NEVER SCORED ZERO.
//    This assertion makes the silent-penalty bug impossible to reintroduce.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-01: missing LinkedIn is un-evidenced and RENORMALIZED OUT (never a zero)',
  ...testOpts,
  fn: async () => {
    if (skip('GR-01')) return;
    const uid = await createUser(`gr01+${uniq()}@strivo.test`, uniq());
    try {
      await seedResume(uid, 82);
      await saveGoal(uid);

      const { score, breakdown } = await readReadiness(uid);
      assert(score !== null, 'a resume-only user with a goal must still get a score');

      const li = component(breakdown, 'linkedin_strength');
      assertEquals(li.evidenced, false, 'linkedin_strength must be UN-EVIDENCED, not scored 0');

      // Recompute what the BANNED alternative would have produced: un-evidenced
      // components scored 0 but their weight KEPT in the denominator (this is what
      // normalizeFromSections does — inapplicable sections lower the achievable ceiling).
      const numerator = breakdown.components
        .filter((c) => c.evidenced)
        .reduce((s, c) => s + (c.score / 100) * c.weight, 0);
      const zeroWithWeightKept = Math.round((100 * numerator) / TOTAL_WEIGHT);

      assert(
        score! > zeroWithWeightKept,
        `Renormalization must produce a STRICTLY HIGHER score than the "score 0 but keep the ` +
          `weight" alternative. Got ${score} vs ${zeroWithWeightKept}. If these are equal, the ` +
          `denominator is no longer filtered and missing LinkedIn is being silently penalised.`,
      );

      // And the denominator really did shrink.
      const evidencedWeight = breakdown.components
        .filter((c) => c.evidenced)
        .reduce((s, c) => s + c.weight, 0);
      assertEquals(breakdown.evidenced_weight, evidencedWeight);
      assert(
        evidencedWeight < TOTAL_WEIGHT,
        'a resume-only user cannot have the full rubric evidenced',
      );
      assertEquals(
        score,
        Math.round((100 * numerator) / evidencedWeight),
        'persisted score must equal SUM(score/100*w | evidenced) / SUM(w | evidenced)',
      );
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. PARTIAL EVIDENCE IS SURFACED (§9f)
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-02: partial evidence is flagged and quantified',
  ...testOpts,
  fn: async () => {
    if (skip('GR-02')) return;
    const uid = await createUser(`gr02+${uniq()}@strivo.test`, uniq());
    try {
      await seedResume(uid, 82);
      await saveGoal(uid);

      const { breakdown } = await readReadiness(uid);
      assertEquals(breakdown.partial_evidence, true, 'partial_evidence must be true');
      assert(
        breakdown.evidenced_weight < 100,
        `evidenced_weight must be < 100 (got ${breakdown.evidenced_weight})`,
      );
      assert(breakdown.blockers.length > 0, 'blockers must name what is missing');
      assert(
        breakdown.blockers.some((b) => b.includes('LinkedIn')),
        'the blocker list must tell the user LinkedIn is missing',
      );
      assert(
        !/offer|hire|hired|probability|chance/i.test(breakdown.interpretation),
        'interpretation must NEVER claim offer/hire probability',
      );
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. MONOTONICITY, EVIDENCE SET HELD CONSTANT.
//    Applying Strivo's feedback and getting a better resume/LinkedIn must move the number.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-03a: raising resumes.overall_score 60 -> 85 STRICTLY raises readiness',
  ...testOpts,
  fn: async () => {
    if (skip('GR-03a')) return;
    const uid = await createUser(`gr03a+${uniq()}@strivo.test`, uniq());
    try {
      const rid = await seedResume(uid, 60);
      await saveGoal(uid);
      const before = (await readReadiness(uid)).score!;

      const { error } = await admin().from('resumes').update({ overall_score: 85 }).eq('id', rid);
      assertEquals(error, null);

      const after = (await readReadiness(uid)).score!;
      assert(after > before, `expected a strict rise, got ${before} -> ${after}`);
    } finally {
      await destroyUser(uid);
    }
  },
});

Deno.test({
  name: 'GR-03b: raising linkedin_grades.overall_score STRICTLY raises readiness',
  ...testOpts,
  fn: async () => {
    if (skip('GR-03b')) return;
    const uid = await createUser(`gr03b+${uniq()}@strivo.test`, uniq());
    try {
      await seedResume(uid, 82);
      await saveGoal(uid);

      const { data: li, error: liErr } = await admin()
        .from('linkedin_grades')
        .insert({
          user_id: uid,
          profile_url: 'https://linkedin.com/in/gr03b',
          profile_identifier: 'gr03b',
          overall_score: 50,
          grading_data: LINKEDIN_GRADING_LOW_OVERLAP,
        })
        .select('id')
        .single();
      assertEquals(liErr, null);

      const before = (await readReadiness(uid)).score!;

      const { error } = await admin()
        .from('linkedin_grades')
        .update({ overall_score: 90 })
        .eq('id', li!.id);
      assertEquals(error, null);

      const after = (await readReadiness(uid)).score!;
      assert(after > before, `expected a strict rise, got ${before} -> ${after}`);
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. INTENTIONAL DROP (§8f) — ADDING A NEW LOW-SCORING EVIDENCE SOURCE CAN LOWER
//    THE SCORE. THIS IS REQUIRED BEHAVIOUR, NOT A BUG.
//
//    Renormalization means an un-evidenced component contributes NOTHING — neither to
//    the numerator nor to the denominator. The moment LinkedIn evidence appears, it
//    joins BOTH. If that evidence is weak, the honest number goes DOWN: Strivo is not
//    applying a penalty, it is REVEALING something it previously could not see.
//
//    Anyone "fixing" this by zeroing or floor-ing un-evidenced components re-breaks the
//    missing-LinkedIn rule (GR-01) and MUST fail this test.
//
//    FIXTURE IS PINNED: adding LinkedIn evidences linkedin_strength AND
//    profile_consistency simultaneously, so LINKEDIN_GRADING_LOW_OVERLAP is authored to
//    share almost no tokens with RESUME_GRADING — landing profile_consistency low too.
//
//    Expected, computed by hand against the SQL rubric (resume 82, 3 strengths,
//    1 priority improvement, no Recruiting Lens, free-tier style grading_data):
//      BEFORE  resume_quality  82 x 25 | goal_alignment 100 x 25 | evidence_depth 65 x 10
//              (ATS / LinkedIn / consistency all UN-evidenced)
//              = (20.50 + 25.00 + 6.50) / 60      -> round(85.83)  = 86
//      AFTER   + linkedin_strength 55 x 15 | + profile_consistency (low) x 10
//              -> denominator 85, numerator ~+8.25 + (low)
//              => a value in the mid-70s, i.e. STRICTLY BELOW the "before".
//    If a future weight change inverts this, the assertion fails LOUDLY instead of
//    silently flipping meaning.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-04: adding a LOW LinkedIn LOWERS readiness — INTENTIONAL and REQUIRED',
  ...testOpts,
  fn: async () => {
    if (skip('GR-04')) return;
    const uid = await createUser(`gr04+${uniq()}@strivo.test`, uniq());
    try {
      await seedResume(uid, 82);
      await saveGoal(uid);

      const before = await readReadiness(uid);
      const X = before.score!;
      assertEquals(component(before.breakdown, 'linkedin_strength').evidenced, false);
      assertEquals(component(before.breakdown, 'profile_consistency').evidenced, false);

      const { error } = await admin().from('linkedin_grades').insert({
        user_id: uid,
        profile_url: 'https://linkedin.com/in/gr04',
        profile_identifier: 'gr04',
        overall_score: 55,
        grading_data: LINKEDIN_GRADING_LOW_OVERLAP,
      });
      assertEquals(error, null);

      const after = await readReadiness(uid);
      const Y = after.score!;

      // Both newly-revealed components are now in play.
      assertEquals(component(after.breakdown, 'linkedin_strength').evidenced, true);
      assertEquals(component(after.breakdown, 'profile_consistency').evidenced, true);
      assert(
        after.breakdown.evidenced_weight > before.breakdown.evidenced_weight,
        'the denominator must GROW when new evidence appears',
      );

      assert(
        Y < X,
        `INTENTIONAL DROP: a resume-only user at ${X} who then grades a weak LinkedIn MUST land ` +
          `strictly below ${X}. Got ${Y}. If this now passes only because un-evidenced components ` +
          `are being scored 0 (or floored), GR-01 is broken and missing LinkedIn is being silently ` +
          `penalised — which is exactly what this rubric forbids.`,
      );
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. STABLE + REPRODUCIBLE (§9f) — same evidence in, same score out. Pure function.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-05: re-running the scorer on unchanged evidence is byte-identical',
  ...testOpts,
  fn: async () => {
    if (skip('GR-05')) return;
    const uid = await createUser(`gr05+${uniq()}@strivo.test`, uniq());
    try {
      await seedResume(uid, 74);
      await saveGoal(uid);

      const first = await readReadiness(uid);

      // service_role retains EXECUTE (anon + authenticated do not).
      const { error } = await admin().rpc('compute_goal_readiness', { p_user_id: uid });
      assertEquals(error, null, 'service_role must be able to invoke the scorer');

      const second = await readReadiness(uid);

      assertEquals(second.score, first.score, 'same evidence in -> same score out');
      assertEquals(
        JSON.stringify(second.breakdown),
        JSON.stringify(first.breakdown),
        'the persisted breakdown must be BYTE-IDENTICAL (computed_at is deliberately NOT in it)',
      );
      // computed_at is the only thing allowed to move.
      assert(second.computedAt !== null && first.computedAt !== null);
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 6. TRIGGERS FIRE ON EVERY EVIDENCE PATH.
//    Evidence is written from 10+ edge functions AND client code. A DB trigger fires
//    regardless of WHICH code path wrote it — that is the whole point of the design.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-06: writing to EACH of the 4 evidence tables recomputes readiness',
  ...testOpts,
  fn: async () => {
    if (skip('GR-06')) return;
    const uid = await createUser(`gr06+${uniq()}@strivo.test`, uniq());
    try {
      // career_targets  (goal saved) — the score must exist immediately.
      const rid = await seedResume(uid, 70);
      await saveGoal(uid);
      let last = (await readReadiness(uid)).computedAt;
      assert(last !== null, 'career_targets write must compute a score');

      const bumped = async (table: string): Promise<void> => {
        const now = (await readReadiness(uid)).computedAt;
        assert(
          now !== null && new Date(now).getTime() > new Date(last!).getTime(),
          `a write to ${table} must recompute goal_readiness (computed_at did not advance: ` +
            `${last} -> ${now}). A missed evidence table = a permanently stale score.`,
        );
        last = now;
      };

      // resumes (UPDATE)
      await admin().from('resumes').update({ overall_score: 71 }).eq('id', rid);
      await bumped('resumes');

      // linkedin_grades (INSERT)
      await admin().from('linkedin_grades').insert({
        user_id: uid,
        profile_url: 'https://linkedin.com/in/gr06',
        profile_identifier: 'gr06',
        overall_score: 64,
        grading_data: LINKEDIN_GRADING_LOW_OVERLAP,
      });
      await bumped('linkedin_grades');

      // analysis_results (INSERT)
      await admin().from('analysis_results').insert({
        user_id: uid,
        analysis_type: 'recruiting_lens',
        raw_response: { keywords: { matched: ['DCF', 'LBO', 'Excel'], missing: ['Bloomberg'] } },
      });
      await bumped('analysis_results');

      // career_targets (UPDATE — target_roles is in the WHEN predicate)
      await admin()
        .from('career_targets')
        .update({ target_roles: ['Investment Banking', 'Private Equity'] })
        .eq('user_id', uid);
      await bumped('career_targets');
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 7. OWNER-SCOPING — user A's readiness is never readable by user B.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-07: user B cannot READ or WRITE user A\'s goal readiness',
  ...testOpts,
  fn: async () => {
    if (skip('GR-07')) return;
    const pwA = uniq();
    const pwB = uniq();
    const emailA = `gr07a+${uniq()}@strivo.test`;
    const emailB = `gr07b+${uniq()}@strivo.test`;
    const uidA = await createUser(emailA, pwA);
    const uidB = await createUser(emailB, pwB);
    try {
      await seedResume(uidA, 88);
      await saveGoal(uidA);
      assert((await readReadiness(uidA)).score !== null);

      // Sign in as B through the ANON client — a real JWT, real RLS.
      const asB = createClient(URL_, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInErr } = await asB.auth.signInWithPassword({
        email: emailB,
        password: pwB,
      });
      assertEquals(signInErr, null, 'test user B must be able to sign in');

      // READ A's row as B -> zero rows (RLS owner-scope).
      const { data: readRows } = await asB
        .from('career_targets')
        .select('user_id, goal_readiness_score')
        .eq('user_id', uidA);
      assertEquals(
        (readRows ?? []).length,
        0,
        `user B must NOT be able to read user A's goal_readiness_score. Got: ${JSON.stringify(readRows)}`,
      );

      // WRITE A's row as B -> denied or a no-op.
      const { data: wrote } = await asB
        .from('career_targets')
        .update({ professional_goal: 'hijacked' })
        .eq('user_id', uidA)
        .select();
      assertEquals((wrote ?? []).length, 0, "user B must not be able to write user A's row");

      // A's goal survived untouched.
      assertEquals((await readReadiness(uidA)).rawGoal, GOAL_RAW);
    } finally {
      await destroyUser(uidA);
      await destroyUser(uidB);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 8. NOT CLIENT-WRITABLE — the score cannot be forged, even on your OWN row.
//    RLS gates ROWS, not COLUMNS. Only the column-level GRANT stops this.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-08: an authenticated user cannot forge goal_readiness_score on their OWN row',
  ...testOpts,
  fn: async () => {
    if (skip('GR-08')) return;
    const pw = uniq();
    const email = `gr08+${uniq()}@strivo.test`;
    const uid = await createUser(email, pw);
    try {
      await seedResume(uid, 61);
      await saveGoal(uid);
      const real = (await readReadiness(uid)).score!;
      assert(real < 100, 'fixture must not already be at 100');

      const asUser = createClient(URL_, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInErr } = await asUser.auth.signInWithPassword({ email, password: pw });
      assertEquals(signInErr, null);

      const { error } = await asUser
        .from('career_targets')
        .update({ goal_readiness_score: 100 })
        .eq('user_id', uid);

      // Either the write is REJECTED (42501 insufficient_privilege) ...
      if (error) {
        assert(
          error.code === '42501' || /permission denied/i.test(error.message),
          `expected a privilege denial, got: ${error.code} ${error.message}`,
        );
      }
      // ... but either way it MUST NOT have taken effect.
      assertEquals(
        (await readReadiness(uid)).score,
        real,
        'the persisted score must be unchanged — a client forged it, which means the column-level ' +
          'GRANT is missing or was widened to include goal_readiness_score.',
      );
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 9. GOAL WORDING PRESERVED (§9e) — parsing NEVER touches the raw text.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-09: the raw professional_goal is byte-identical after parsing',
  ...testOpts,
  fn: async () => {
    if (skip('GR-09')) return;
    const uid = await createUser(`gr09+${uniq()}@strivo.test`, uniq());
    try {
      await seedResume(uid, 77);
      await saveGoal(uid, GOAL_RAW);

      const { rawGoal } = await readReadiness(uid);
      assertEquals(rawGoal, GOAL_RAW, 'the user\'s wording must be preserved EXACTLY');

      const { data } = await admin()
        .from('career_targets')
        .select('professional_goal_structured')
        .eq('user_id', uid)
        .single();

      const structured = data!.professional_goal_structured as Record<string, string | null>;
      assert(structured !== null, 'a structured form must be derived');
      // Deterministic parse of GOAL_RAW, no model call:
      assertEquals(structured.year, '2027');
      assertEquals(structured.opportunity_type, 'internship');
      assertEquals(structured.location, 'New York');
      assertEquals(structured.role, 'Investment Banking'); // longest taxonomy match
      // Only the DERIVED form exists — the raw text was never rewritten.
      assertEquals((await readReadiness(uid)).rawGoal, GOAL_RAW);
    } finally {
      await destroyUser(uid);
    }
  },
});

// ════════════════════════════════════════════════════════════════════════════════
// 10. THE POSITIVE PATH — an authenticated client CAN actually save its goal.
//
//     GR-08 proves the score cannot be WRITTEN. It does NOT prove the goal CAN be.
//     Those are independent properties, and the original column-level GRANT in
//     20260712000001 satisfied the first while breaking the second for EVERY user:
//     its GRANT UPDATE list omitted user_id, so PostgREST's merge-duplicates upsert
//     (`ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id, ...`) was
//     rejected with 42501 — on the fresh-INSERT path too, because Postgres checks
//     column privileges at execution start. Onboarding could never save a goal, and
//     /dashboard (gated on having one) was unreachable. Fixed by 20260712000003.
//
//     Every helper above writes via admin() / the SERVICE ROLE, which BYPASSES column
//     grants entirely. That is precisely why the whole suite stayed green through a
//     total client-write outage. This test uses a real anon-key client with a real
//     role=authenticated JWT — the same privilege path the browser takes.
// ════════════════════════════════════════════════════════════════════════════════
Deno.test({
  name: 'GR-11: an authenticated client CAN insert AND upsert its goal (and still cannot forge the score)',
  ...testOpts,
  fn: async () => {
    if (skip('GR-11')) return;
    const pw = uniq();
    const email = `gr11+${uniq()}@strivo.test`;
    const uid = await createUser(email, pw);
    try {
      await seedResume(uid, 72);

      const asUser = createClient(URL_, ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: signInErr } = await asUser.auth.signInWithPassword({ email, password: pw });
      assertEquals(signInErr, null, 'test user must be able to sign in');

      // ── 1. FRESH INSERT — byte-for-byte the Onboarding.tsx step-4 "Finish Setup" write.
      //    No career_targets row exists yet, so ON CONFLICT never fires — yet this is the
      //    exact call that was failing, because the DO UPDATE arm's privileges are checked
      //    at execution start regardless.
      const { error: insertErr } = await asUser.from('career_targets').upsert(
        {
          user_id: uid,
          target_roles: ['Investment Banking'],
          target_industries: ['Finance'],
          professional_goal: GOAL_RAW,
          professional_goal_set_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      assertEquals(
        insertErr,
        null,
        `an authenticated user MUST be able to save their professional goal. ` +
          `A 42501 here means the column-level GRANT UPDATE on career_targets is missing a ` +
          `column the client sends (user_id was the original offender) — onboarding is broken ` +
          `and /dashboard is unreachable for every user. Got: ${JSON.stringify(insertErr)}`,
      );

      const afterInsert = await readReadiness(uid);
      assertEquals(afterInsert.rawGoal, GOAL_RAW, 'the goal must actually have landed');
      assert(afterInsert.score !== null, 'the trigger must have scored the fresh row');

      // ── 2. CONFLICT/UPDATE path — GoalEditDialog re-saving over the existing row.
      const EDITED = 'PE associate 2028 in London — Private Equity';
      const { error: updateErr } = await asUser.from('career_targets').upsert(
        {
          user_id: uid,
          professional_goal: EDITED,
          professional_goal_set_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      assertEquals(
        updateErr,
        null,
        `editing the goal must succeed on the ON CONFLICT DO UPDATE path. Got: ${JSON.stringify(updateErr)}`,
      );
      assertEquals((await readReadiness(uid)).rawGoal, EDITED, 'the edited goal must persist');

      // ── 3. Profile.tsx's career-targets save — the flow this task REGRESSED.
      const { error: profileErr } = await asUser.from('career_targets').upsert(
        {
          user_id: uid,
          target_industries: ['Private Equity'],
          target_roles: ['Private Equity'],
          target_companies: ['Blackstone'],
          location_preference: 'London',
          career_goals: 'Break into PE',
        },
        { onConflict: 'user_id' },
      );
      assertEquals(
        profileErr,
        null,
        `Profile.tsx's career-targets save worked BEFORE this task and must keep working. ` +
          `Got: ${JSON.stringify(profileErr)}`,
      );

      // ── 4. The grant is not too WIDE either: the tamper hole stays shut.
      //    goal_readiness_score is simply absent from the grant list, so this still 42501s.
      const real = (await readReadiness(uid)).score!;
      const { error: forgeErr } = await asUser
        .from('career_targets')
        .update({ goal_readiness_score: 100 })
        .eq('user_id', uid);
      if (forgeErr) {
        assert(
          forgeErr.code === '42501' || /permission denied/i.test(forgeErr.message),
          `expected a privilege denial when forging the score, got: ${forgeErr.code} ${forgeErr.message}`,
        );
      }
      assertEquals(
        (await readReadiness(uid)).score,
        real,
        'widening the grant to fix the upsert must NOT have made goal_readiness_score writable.',
      );

      // Same for the other scorer-owned column.
      const { error: structErr } = await asUser
        .from('career_targets')
        .update({ professional_goal_structured: { role: 'CEO' } })
        .eq('user_id', uid);
      if (structErr) {
        assert(
          structErr.code === '42501' || /permission denied/i.test(structErr.message),
          `expected a privilege denial on professional_goal_structured, got: ${structErr.code} ${structErr.message}`,
        );
      }
      const { data: structRow } = await admin()
        .from('career_targets')
        .select('professional_goal_structured')
        .eq('user_id', uid)
        .single();
      const structured = structRow!.professional_goal_structured as Record<string, unknown> | null;
      assert(
        structured === null || structured.role !== 'CEO',
        'professional_goal_structured must remain scorer-owned and non-forgeable.',
      );
    } finally {
      await destroyUser(uid);
    }
  },
});

// Keep the rubric constants referenced so a future weight edit in SQL that is not
// mirrored here is at least visible at the diff level.
Deno.test({
  name: 'GR-10: rubric weights sum to 100',
  ...testOpts,
  fn: () => {
    assertEquals(
      Object.values(WEIGHTS).reduce((a, b) => a + b, 0),
      TOTAL_WEIGHT,
    );
  },
});
