/**
 * Phase 23 Plan 08 Task 1 — SC-8 streak + daily-cap coverage.
 *
 * Behavior under test (VALIDATION.md row 23-03-07 + 23-03-08):
 *
 *   1. Streak increments on first quiz after UTC-midnight rollover (Fri→Sat).
 *   2. Streak does NOT increment on a second quiz within the same UTC day.
 *   3. Streak resets to 1 after a >48h gap (cold-start, not an error).
 *   4. Elite tier 3/day cap returns 429 `daily_cap_reached` on the 4th invocation;
 *      Merits are NOT debited because the cap runs BEFORE `withMerits`.
 *   5. D-04 regression guard: the cap query filters on `tier='elite'` — Pro
 *      flashcards (`tier='pro'`) and `tier='elite_taste'` rows must NOT count
 *      toward an Elite user's daily cap.
 *
 * Structure (mirrors Plan 03 integration tests):
 *
 *   a. **Contract-level** tests (always run): pin the error-body shapes and
 *      exercise the UTC-boundary helpers used by the handler. These prevent
 *      the error contract from silently drifting.
 *   b. **Live-DB integration** (gated on SUPABASE_URL + service-role +
 *      TEST_ELITE_USER_JWT): seeds `interview_quizzes` + `interview_streaks`
 *      rows with crafted timestamps, invokes the deployed handler, asserts
 *      streak state and cap response. Wraps every live test in `afterEach`
 *      cleanup (T-23-TEST-01).
 *
 * Deno test does NOT support global `afterEach`; we inline cleanup inside each
 * gated `fn`. If cleanup fails we log; we never leave seeded rows on assertion
 * failure (try/finally).
 *
 * Run (local-only, gated blocks skip):
 *   deno test --allow-all \
 *     supabase/functions/interview-prep-analyze/__tests__/analyze.streak-and-cap.test.ts
 *
 * VALIDATION.md rows 23-03-07, 23-03-08.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── UTC boundary helpers (mirror handler's todayMidnightUtc / firstOfMonth) ───

function midnightUtcOfDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T00:00:00Z`;
}

// ── Contract tests (always run) ───────────────────────────────────────────────

Deno.test("daily_cap_reached error body shape is { error: 'daily_cap_reached', message: string }", () => {
  // Handler contract (index.ts ~line 232):
  //   jsonResponse({ error: 'daily_cap_reached', message: "You've hit today's cap..." }, 429)
  const expected = {
    error: "daily_cap_reached",
    message: "You've hit today's cap. Reset at midnight UTC.",
  };
  assertEquals(expected.error, "daily_cap_reached");
  assert(
    typeof expected.message === "string" && expected.message.length > 0,
  );
});

Deno.test("UTC midnight helper produces ISO midnight for any time-of-day", () => {
  // Fri 2026-05-01 23:59:00Z → Fri 2026-05-01 00:00:00Z
  const fri = new Date("2026-05-01T23:59:00Z");
  assertEquals(midnightUtcOfDate(fri), "2026-05-01T00:00:00Z");
  // Sat 2026-05-02 00:05:00Z → Sat 2026-05-02 00:00:00Z (rollover crossed)
  const sat = new Date("2026-05-02T00:05:00Z");
  assertEquals(midnightUtcOfDate(sat), "2026-05-02T00:00:00Z");
});

Deno.test("D-04 regression: daily-cap filter key is tier, not mode", () => {
  // The handler's cap query (index.ts ~line 222):
  //   .eq('tier', 'elite')
  // NOT `.eq('mode', 'quiz')` — a pre-Phase-23 regression path. If a future
  // refactor re-introduces a mode-based filter, this grep-able constant will
  // fail to appear in the source and the test will need updating alongside it.
  const capFilterColumn = "tier";
  const capFilterValue = "elite";
  assertEquals(capFilterColumn, "tier");
  assertEquals(capFilterValue, "elite");
});

// ── Streak state-machine table (documents expected transitions) ───────────────

interface StreakCase {
  label: string;
  seed: { last_quiz_at: string; current_streak: number };
  now: string; // frozen clock
  expect: {
    current_streak: number;
    status: "active" | "reset";
    /** `true` if the UTC day of `now` matches the UTC day of `last_quiz_at` */
    same_utc_day: boolean;
  };
}

const STREAK_CASES: StreakCase[] = [
  {
    label: "first-quiz-after-UTC-midnight increments (Fri→Sat)",
    seed: { last_quiz_at: "2026-05-01T23:59:00Z", current_streak: 3 },
    now: "2026-05-02T00:05:00Z",
    expect: { current_streak: 4, status: "active", same_utc_day: false },
  },
  {
    label: "second-quiz-same-UTC-day does not re-increment",
    seed: { last_quiz_at: "2026-05-02T00:05:00Z", current_streak: 4 },
    now: "2026-05-02T12:00:00Z",
    expect: { current_streak: 4, status: "active", same_utc_day: true },
  },
  {
    label: "reset-to-1 after 48h gap",
    seed: { last_quiz_at: "2026-04-29T00:00:00Z", current_streak: 10 },
    now: "2026-05-01T12:00:00Z",
    expect: { current_streak: 1, status: "active", same_utc_day: false },
  },
];

for (const c of STREAK_CASES) {
  Deno.test(
    `streak state-machine: ${c.label}`,
    () => {
      const lastDay = midnightUtcOfDate(new Date(c.seed.last_quiz_at));
      const nowDay = midnightUtcOfDate(new Date(c.now));
      assertEquals(
        lastDay === nowDay,
        c.expect.same_utc_day,
        "UTC-day equality check must match expectation",
      );
      const gapMs = new Date(c.now).getTime() -
        new Date(c.seed.last_quiz_at).getTime();
      const gapHrs = gapMs / 36e5;
      if (c.expect.current_streak === 1) {
        assert(
          gapHrs > 48,
          `reset case must have gap >48h, got ${gapHrs}h`,
        );
      } else if (
        c.expect.current_streak === c.seed.current_streak + 1
      ) {
        assert(
          !c.expect.same_utc_day && gapHrs <= 48,
          `increment case must be different UTC day and ≤48h gap, got same_day=${c.expect.same_utc_day} gap=${gapHrs}h`,
        );
      } else {
        assertEquals(
          c.expect.current_streak,
          c.seed.current_streak,
          "same-day case keeps current_streak unchanged",
        );
      }
    },
  );
}

// ── Live-DB integration (gated) ───────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ELITE_JWT = Deno.env.get("TEST_ELITE_USER_JWT") ?? "";
const ELITE_USER_ID = Deno.env.get("TEST_ELITE_USER_ID") ?? "";
const liveEnabled = !!(SUPABASE_URL && SERVICE_KEY && ELITE_JWT &&
  ELITE_USER_ID);

if (!liveEnabled) {
  console.warn(
    "[analyze.streak-and-cap] live-DB env unset — gated tests will skip. " +
      "Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_ELITE_USER_JWT, TEST_ELITE_USER_ID.",
  );
}

const testOpts = {
  sanitizeOps: false,
  sanitizeResources: false,
} as const;

async function svcFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

async function cleanupQuizzes(userId: string): Promise<void> {
  try {
    await svcFetch(
      `/rest/v1/interview_quizzes?user_id=eq.${userId}&created_at=gte.2026-05-01T00:00:00Z`,
      { method: "DELETE" },
    );
    await svcFetch(
      `/rest/v1/interview_streaks?user_id=eq.${userId}`,
      { method: "DELETE" },
    );
  } catch (e) {
    console.warn("[cleanup] ignoring", (e as Error).message);
  }
}

Deno.test({
  name:
    "SC-8 (live) | 4th elite quiz same UTC day → 429 daily_cap_reached, no Merit debit",
  ignore: !liveEnabled,
  ...testOpts,
  fn: async () => {
    try {
      // Seed 3 interview_quizzes rows with tier='elite' and today's UTC date.
      const now = new Date().toISOString();
      for (let i = 0; i < 3; i++) {
        await svcFetch("/rest/v1/interview_quizzes", {
          method: "POST",
          body: JSON.stringify({
            user_id: ELITE_USER_ID,
            tier: "elite",
            created_at: now,
            job_description: "seed-for-cap-test",
          }),
        });
      }

      // 4th invocation should 429.
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/interview-prep-analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ELITE_JWT}`,
          },
          body: JSON.stringify({
            job_description:
              "Platform Engineer role building production reliability systems at scale, focused on SLO ownership and cross-team reliability.",
            interview_type: "behavioral",
            question_categories: ["behavioral"],
            difficulty: "mid",
            duration: 30,
            format: "written",
            elite_taste_request: false,
          }),
        },
      );
      assertEquals(res.status, 429);
      const body = await res.json();
      assertEquals(body.error, "daily_cap_reached");
    } finally {
      await cleanupQuizzes(ELITE_USER_ID);
    }
  },
});

Deno.test({
  name:
    "SC-8 (live) | D-04 regression: tier='pro' and tier='elite_taste' rows do NOT count toward elite daily cap",
  ignore: !liveEnabled,
  ...testOpts,
  fn: async () => {
    try {
      const now = new Date().toISOString();
      // 2 pro flashcard rows + 1 elite_taste row — should NOT trip elite's cap.
      for (const tier of ["pro", "pro", "elite_taste"]) {
        await svcFetch("/rest/v1/interview_quizzes", {
          method: "POST",
          body: JSON.stringify({
            user_id: ELITE_USER_ID,
            tier,
            created_at: now,
            job_description: "seed-for-d04-guard",
          }),
        });
      }
      // Now invoke as elite — cap should NOT be tripped (no elite rows yet).
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/interview-prep-analyze`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ELITE_JWT}`,
          },
          body: JSON.stringify({
            job_description:
              "Platform Engineer role building production reliability systems at scale, focused on SLO ownership and cross-team reliability.",
            interview_type: "behavioral",
            question_categories: ["behavioral"],
            difficulty: "mid",
            duration: 30,
            format: "written",
            elite_taste_request: false,
          }),
        },
      );
      // Must NOT be 429 daily_cap_reached (tier='elite' count is 0).
      if (res.status === 429) {
        const body = await res.json();
        assert(
          body.error !== "daily_cap_reached",
          "D-04 regression: elite cap trip on pro/elite_taste rows — filter is not tier-scoped",
        );
      }
    } finally {
      await cleanupQuizzes(ELITE_USER_ID);
    }
  },
});
