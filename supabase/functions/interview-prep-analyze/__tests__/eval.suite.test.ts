/**
 * Phase 23 Plan 08 Task 3 — SC-10 honest-scoring regression suite.
 *
 * **Gated by `RUN_EVALS=1`**. Skipped in CI by default (T-23-TEST-03 defense
 * against accidental Anthropic spend). Run on-demand before shipping prompt
 * changes to guard against readiness-breakdown drift.
 *
 * Harness:
 *   1. Load 30 labeled examples from `fixtures/eval/weak-fit-30.jsonl`
 *      (10 weak <40, 10 moderate 40-70, 10 strong >70 across 3 dimensions).
 *   2. For each example, call the deployed analyze handler (no fixture
 *      replay — this IS the regression canary; it must hit real Anthropic).
 *   3. Bucket both labels and predictions into {low, mid, high}.
 *   4. Compute Cohen's κ per dimension (role_fit_score, experience_score,
 *      technical_score). Fail if any κ < 0.7.
 *
 * 30 examples is a floor (T-23-KAPPA-01). On regression, scale to 60+ by
 * adding rows to the JSONL and rerun.
 *
 * Cohen's κ reference: https://en.wikipedia.org/wiki/Cohen%27s_kappa (linear
 * weighted form for ordinal categories is overkill for 3 buckets — the
 * unweighted form is appropriate here).
 *
 * Contract-level tests at the bottom of this file ALWAYS run; they pin the
 * JSONL shape and the κ helper math so a fixture or helper regression is
 * caught without spending Anthropic credits.
 *
 * Run (manual only):
 *   RUN_EVALS=1 \
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... TEST_ELITE_USER_JWT=... \
 *   deno test --allow-all \
 *     supabase/functions/interview-prep-analyze/__tests__/eval.suite.test.ts
 *
 * VALIDATION.md row 23-10 (SC-10).
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EvalFixture {
  id: string;
  resume: string;
  role_title: string;
  company: string;
  duration: 15 | 30 | 45 | 60;
  difficulty: "junior" | "mid" | "senior";
  labels: {
    role_fit_score: number;
    experience_score: number;
    technical_score: number;
  };
}

type Bucket = "low" | "mid" | "high";

// ── Helpers ───────────────────────────────────────────────────────────────────

export function bucket(score: number): Bucket {
  if (score < 40) return "low";
  if (score < 70) return "mid";
  return "high";
}

/**
 * Cohen's κ for unweighted agreement on categorical labels.
 * p_o = observed agreement rate
 * p_e = expected agreement rate if raters were independent
 * κ = (p_o - p_e) / (1 - p_e)
 */
export function cohenKappa(a: Bucket[], b: Bucket[]): number {
  if (a.length !== b.length) {
    throw new Error(`cohenKappa: length mismatch ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) return 0;
  const n = a.length;
  const categories: Bucket[] = ["low", "mid", "high"];
  let agree = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
  }
  const po = agree / n;
  let pe = 0;
  for (const c of categories) {
    const pa = a.filter((x) => x === c).length / n;
    const pb = b.filter((x) => x === c).length / n;
    pe += pa * pb;
  }
  if (pe >= 1) return po === 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

const FIXTURE_PATH = new URL(
  "./fixtures/eval/weak-fit-30.jsonl",
  import.meta.url,
);

function loadFixtures(): EvalFixture[] {
  const raw = Deno.readTextFileSync(FIXTURE_PATH);
  return raw.trim().split(/\r?\n/).filter((l) => l.length > 0).map((l) =>
    JSON.parse(l) as EvalFixture
  );
}

// ── Contract tests (always run) ───────────────────────────────────────────────

Deno.test("fixture shape: weak-fit-30.jsonl has exactly 30 valid-schema lines", () => {
  const fx = loadFixtures();
  assertEquals(fx.length, 30);
  for (const ex of fx) {
    assert(typeof ex.id === "string" && ex.id.length > 0);
    assert(typeof ex.resume === "string" && ex.resume.length > 0);
    assert(typeof ex.role_title === "string" && ex.role_title.length > 0);
    assert(typeof ex.company === "string" && ex.company.length > 0);
    assert([15, 30, 45, 60].includes(ex.duration));
    assert(["junior", "mid", "senior"].includes(ex.difficulty));
    for (
      const key of [
        "role_fit_score",
        "experience_score",
        "technical_score",
      ] as const
    ) {
      const v = ex.labels[key];
      assert(
        typeof v === "number" && v >= 0 && v <= 100,
        `${ex.id}.labels.${key} must be in [0,100], got ${v}`,
      );
    }
  }
});

Deno.test("fixture distribution: 10 low + 10 mid + 10 high across role_fit_score", () => {
  const fx = loadFixtures();
  const dist = { low: 0, mid: 0, high: 0 };
  for (const ex of fx) {
    dist[bucket(ex.labels.role_fit_score)]++;
  }
  assertEquals(dist.low, 10, "must have 10 weak fits (score <40)");
  assertEquals(dist.mid, 10, "must have 10 moderate fits (40-70)");
  assertEquals(dist.high, 10, "must have 10 strong fits (>=70)");
});

Deno.test("bucket helper: thresholds are score<40→low, <70→mid, >=70→high", () => {
  assertEquals(bucket(0), "low");
  assertEquals(bucket(39), "low");
  assertEquals(bucket(40), "mid");
  assertEquals(bucket(69), "mid");
  assertEquals(bucket(70), "high");
  assertEquals(bucket(100), "high");
});

Deno.test("cohenKappa: perfect agreement → 1.0", () => {
  const a: Bucket[] = ["low", "mid", "high", "low", "mid", "high"];
  const b: Bucket[] = ["low", "mid", "high", "low", "mid", "high"];
  assertEquals(cohenKappa(a, b), 1);
});

Deno.test("cohenKappa: complete disagreement → near 0 or negative", () => {
  const a: Bucket[] = ["low", "low", "low", "high", "high", "high"];
  const b: Bucket[] = ["high", "high", "high", "low", "low", "low"];
  const k = cohenKappa(a, b);
  assert(k < 0, `complete-disagreement κ must be negative, got ${k}`);
});

Deno.test("cohenKappa: length mismatch throws", () => {
  let threw = false;
  try {
    cohenKappa(["low"], ["low", "mid"]);
  } catch {
    threw = true;
  }
  assert(threw, "length mismatch must throw");
});

// ── Gated live eval (RUN_EVALS=1) ─────────────────────────────────────────────

const RUN = Deno.env.get("RUN_EVALS") === "1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ELITE_JWT = Deno.env.get("TEST_ELITE_USER_JWT") ?? "";
const liveEnabled = !!(RUN && SUPABASE_URL && ELITE_JWT);

if (RUN && !liveEnabled) {
  console.warn(
    "[eval.suite] RUN_EVALS=1 but SUPABASE_URL or TEST_ELITE_USER_JWT missing — skipping.",
  );
}

const testOpts = {
  sanitizeOps: false,
  sanitizeResources: false,
} as const;

Deno.test({
  name:
    "SC-10 | honest-scoring: Cohen κ ≥ 0.7 on role_fit / experience / technical (RUN_EVALS=1)",
  ignore: !liveEnabled,
  ...testOpts,
  fn: async () => {
    const fx = loadFixtures();
    const predicted: Array<
      {
        id: string;
        labels: EvalFixture["labels"];
        predicted: EvalFixture["labels"];
      }
    > = [];
    for (const ex of fx) {
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
              `${ex.role_title} at ${ex.company}. Evaluate fit rigorously.`,
            background_context: ex.resume.slice(0, 200),
            role_title: ex.role_title,
            company: ex.company,
            interview_type: "behavioral",
            question_categories: ["behavioral"],
            difficulty: ex.difficulty,
            duration: ex.duration,
            format: "written",
            elite_taste_request: false,
          }),
        },
      );
      if (!res.ok) {
        throw new Error(
          `eval fixture ${ex.id} failed: ${res.status} ${await res.text()}`,
        );
      }
      const body = await res.json();
      const rb = body.payload?.readiness_breakdown ?? {};
      predicted.push({
        id: ex.id,
        labels: ex.labels,
        predicted: {
          role_fit_score: rb.role_fit_score ?? 0,
          experience_score: rb.experience_score ?? 0,
          technical_score: rb.technical_score ?? 0,
        },
      });
    }

    for (
      const dim of [
        "role_fit_score",
        "experience_score",
        "technical_score",
      ] as const
    ) {
      const k = cohenKappa(
        predicted.map((r) => bucket(r.labels[dim])),
        predicted.map((r) => bucket(r.predicted[dim])),
      );
      assert(
        k >= 0.7,
        `${dim} κ = ${k.toFixed(3)} < 0.7 threshold — honest-scoring regression. Inspect per-fixture diffs before shipping prompt changes.`,
      );
    }
  },
});
