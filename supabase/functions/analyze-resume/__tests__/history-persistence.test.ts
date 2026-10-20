import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertAnalysisResult,
  assertFunctionSucceeded,
  cleanupRows,
  freshClient,
  invokeFunction,
  latestLinkedUsage,
  optionalEnv,
  remoteTestFixture,
  skipRemote,
} from "../../_shared/__tests__/history-persistence-remote.ts";

const UNLOCK_FILE_HASH = "f".repeat(64);
const UNLOCK_TEXT_HASH = "t".repeat(64);
const UNLOCK_DOCUMENT_HASH = "d".repeat(64);

function unlockBase(): Record<string, unknown> {
  return {
    overallScore: 67,
    executiveSummary: { highImpactFix: "Quantify impact" },
    strengths: ["Clear progression"],
    priorityImprovements: ["Add one metric"],
    rewriteSuggestions: [{ improvedText: "Existing Free rewrite" }],
    criterionFeedback: [
      { id: "c1_visual_clarity", label: "Visual", weight: 6, score: 70 },
      {
        id: "c6_achievement_orientation",
        label: "Impact",
        weight: 20,
        score: 64,
        feedback: { observation: "Stored", impact: "Stored", fix: "Stored" },
      },
    ],
  };
}

function unlockMerged(): Record<string, unknown> {
  return {
    ...unlockBase(),
    industryGuess: "Software Engineering",
    suggestedTargetRoles: ["Frontend Engineer"],
    recommendedKeywords: ["TypeScript"],
    eliteInsights: { competitiveRanking: "Top 25%" },
  };
}

interface UnlockSeed {
  userId: string;
  jwt: string;
  resumeId: string;
  baseAnalysisId: string;
  usageId: string;
  runId: string;
  args: Record<string, unknown>;
}

async function seedUnlockLane(): Promise<UnlockSeed> {
  const { userId, jwt } = await remoteTestFixture();
  const client = await freshClient();
  const base = unlockBase();
  const idempotencyKey = `resume-elite-unlock:${userId}:${crypto.randomUUID()}`;

  const { data: resume, error: resumeError } = await client
    .from("resumes")
    .insert({
      user_id: userId,
      file_name: "incremental-unlock-fixture.pdf",
      file_url: "https://example.invalid/incremental-unlock-fixture.pdf",
      file_size: 512,
      extracted_text: "Synthetic frontend engineer resume with measurable product delivery.",
      file_hash: UNLOCK_FILE_HASH,
      text_hash: UNLOCK_TEXT_HASH,
      document_hash: UNLOCK_DOCUMENT_HASH,
      analyzed_tier: "free",
      overall_score: 67,
      grading_data: base,
    })
    .select("id")
    .single();
  if (resumeError || !resume?.id) {
    throw new Error(`unlock resume seed failed: ${resumeError?.message ?? "no id"}`);
  }

  const { data: baseAnalysis, error: baseError } = await client
    .from("analysis_results")
    .insert({
      user_id: userId,
      analysis_type: "resume_analysis",
      source_reference: resume.id,
      primary_score: 67,
      key_insights: { generation_mode: "full_free" },
      raw_response: base,
    })
    .select("id")
    .single();
  if (baseError || !baseAnalysis?.id) {
    throw new Error(`unlock base seed failed: ${baseError?.message ?? "no id"}`);
  }

  const periodStart = new Date();
  periodStart.setUTCDate(1);
  periodStart.setUTCHours(0, 0, 0, 0);
  const { data: usage, error: usageError } = await client
    .from("usage_tracking")
    .insert({
      user_id: userId,
      action_type: "resume_analysis",
      billing_period_start: periodStart.toISOString(),
      credits_consumed: 1,
    })
    .select("id")
    .single();
  if (usageError || !usage?.id) {
    throw new Error(`unlock usage seed failed: ${usageError?.message ?? "no id"}`);
  }

  const { data: run, error: runError } = await client
    .from("analysis_jobs")
    .insert({
      user_id: userId,
      job_type: "resume_analysis",
      status: "processing",
      payload: { resumeId: resume.id, mode: "elite_unlock" },
      state: "saving",
      feature: "resume_analysis",
      tier: "elite",
      idempotency_key: idempotencyKey,
      merit_settled: false,
      refunded: false,
    })
    .select("id")
    .single();
  if (runError || !run?.id) {
    throw new Error(`unlock lifecycle seed failed: ${runError?.message ?? "no id"}`);
  }

  return {
    userId,
    jwt,
    resumeId: resume.id,
    baseAnalysisId: baseAnalysis.id,
    usageId: usage.id,
    runId: run.id,
    args: {
      p_owner_id: userId,
      p_resume_id: resume.id,
      p_base_analysis_id: baseAnalysis.id,
      p_expected_file_hash: UNLOCK_FILE_HASH,
      p_expected_text_hash: UNLOCK_TEXT_HASH,
      p_expected_document_hash: UNLOCK_DOCUMENT_HASH,
      p_expected_base_grading_data: base,
      p_expected_base_fingerprint: `${baseAnalysis.id}:${UNLOCK_TEXT_HASH}`,
      p_idempotency_key: idempotencyKey,
      p_merged_grading_data: unlockMerged(),
      p_generated_sections: ["industryGuess", "eliteInsights"],
      p_usage_id: usage.id,
      p_run_id: run.id,
    },
  };
}

async function cleanupUnlockSeed(seed: UnlockSeed): Promise<void> {
  const client = await freshClient();
  await client.from("usage_tracking").delete().eq("id", seed.usageId);
  await client.from("analysis_results").delete().eq("source_reference", seed.resumeId);
  await client.from("analysis_jobs").delete().eq("id", seed.runId);
  await client.from("resumes").delete().eq("id", seed.resumeId);
}

Deno.test("incremental_unlock migration statically locks transaction and grants", async () => {
  const sql = await Deno.readTextFile(
    new URL(
      "../../../migrations/20260730010000_resume_elite_unlock.sql",
      import.meta.url,
    ),
  );
  assert(sql.includes("SECURITY DEFINER"));
  assert(sql.includes("SET search_path = public, pg_temp"));
  assert(sql.includes("pg_advisory_xact_lock"));
  assert(sql.includes("FOR UPDATE"));
  assert(sql.includes("source_reference = p_resume_id::text"));
  assert(sql.includes("analyzed_tier IS DISTINCT FROM 'free'"));
  assert(sql.includes("generation_mode', 'incremental_unlock'"));
  assert(sql.includes("SET analysis_id = v_merged_analysis_id"));
  assert(sql.includes("FROM PUBLIC, anon, authenticated"));
  assert(sql.includes("TO service_role"));
  assertEquals(/\bUPDATE\s+public\.analysis_results\b/i.test(sql), false);
  assertEquals(/\bDELETE\s+FROM\s+public\.analysis_results\b/i.test(sql), false);
});

Deno.test("TEST-05 resume: successful staging run writes resumes, analysis_results, and linked usage", async () => {
  if (skipRemote("resume success")) return;
  const { userId, jwt, resumeId } = await remoteTestFixture();
  const sinceIso = new Date().toISOString();

  const result = await invokeFunction("analyze-resume", jwt, {
    resumeId,
    resumeText: optionalEnv("MERIT_TEST_RESUME_TEXT") ||
      "Senior product manager with eight years of experience leading cross-functional launches, improving activation by 24 percent, and managing roadmap delivery across engineering, design, sales, and customer success teams.",
    targetRole: "Senior Product Manager",
    targetIndustry: "SaaS",
    stream: false,
  });

  assertFunctionSucceeded(result, "analyze-resume");
  const usage = await latestLinkedUsage({ userId, actionType: "resume_analysis", sinceIso });
  const analysis = await assertAnalysisResult({ analysisId: usage.analysis_id, analysisType: "resume_analysis" });
  assertEquals(analysis.source_reference, resumeId);
  await cleanupRows([{ table: "usage_tracking", id: usage.id }, { table: "analysis_results", id: usage.analysis_id }]);
});

Deno.test("TEST-05 resume negative: validation failure leaves no usage_tracking row", async () => {
  if (skipRemote("resume negative")) return;
  const { userId, jwt, resumeId } = await remoteTestFixture();
  const sinceIso = new Date().toISOString();

  const result = await invokeFunction("analyze-resume", jwt, {
    resumeId,
    resumeText: "too short",
    stream: false,
  });

  assert(result.status >= 400, `expected validation failure, got ${result.status}`);
  let wroteUsage = true;
  try {
    await latestLinkedUsage({ userId, actionType: "resume_analysis", sinceIso });
  } catch {
    wroteUsage = false;
  }
  assert(!wroteUsage, "failed resume analysis must not write usage_tracking");
});

Deno.test("AC-03/07 incremental_unlock rejects ownership and stale identities without writes", async () => {
  if (skipRemote("incremental unlock guards")) return;
  const seed = await seedUnlockLane();
  const client = await freshClient();

  try {
    const rejectedArgs = [
      { ...seed.args, p_owner_id: crypto.randomUUID() },
      { ...seed.args, p_base_analysis_id: crypto.randomUUID() },
      { ...seed.args, p_expected_text_hash: "changed-content" },
      { ...seed.args, p_expected_base_fingerprint: "stale-base" },
      {
        ...seed.args,
        p_expected_base_grading_data: { ...unlockBase(), overallScore: 99 },
      },
    ];

    for (const args of rejectedArgs) {
      const { error } = await client.rpc("persist_resume_elite_unlock", args);
      assert(error, "stale or foreign unlock identity must be rejected");
    }

    const { data: nonFreeResume, error: nonFreeUpdateError } = await client
      .from("resumes")
      .update({ analyzed_tier: "elite" })
      .eq("id", seed.resumeId)
      .select("analyzed_tier")
      .single();
    assertEquals(nonFreeUpdateError, null);
    assertEquals(nonFreeResume?.analyzed_tier, "elite");
    const { error: tierError } = await client.rpc("persist_resume_elite_unlock", seed.args);
    assert(tierError, "a non-Free source tier must be rejected");
    const { error: restoreTierError } = await client
      .from("resumes")
      .update({ analyzed_tier: "free" })
      .eq("id", seed.resumeId);
    assertEquals(restoreTierError, null);

    const { data: resume } = await client
      .from("resumes")
      .select("grading_data, analyzed_tier")
      .eq("id", seed.resumeId)
      .single();
    assertEquals(resume?.grading_data, unlockBase());
    assertEquals(resume?.analyzed_tier, "free");

    const { count: mirrorCount } = await client
      .from("analysis_results")
      .select("id", { count: "exact", head: true })
      .eq("source_reference", seed.resumeId);
    assertEquals(mirrorCount, 1);

    const { data: usage } = await client
      .from("usage_tracking")
      .select("analysis_id")
      .eq("id", seed.usageId)
      .single();
    assertEquals(usage?.analysis_id, null);
  } finally {
    await cleanupUnlockSeed(seed);
  }
});

Deno.test("AC-03/04/06/09 incremental_unlock converges concurrency and replay", async () => {
  if (skipRemote("incremental unlock atomic replay")) return;
  const seed = await seedUnlockLane();
  const client = await freshClient();

  try {
    const [left, right] = await Promise.all([
      client.rpc("persist_resume_elite_unlock", seed.args),
      client.rpc("persist_resume_elite_unlock", seed.args),
    ]);
    assertEquals(left.error, null);
    assertEquals(right.error, null);

    const leftResult = left.data as Record<string, unknown>;
    const rightResult = right.data as Record<string, unknown>;
    assertEquals(leftResult.analysis_id, rightResult.analysis_id);
    assert(
      leftResult.replayed === true || rightResult.replayed === true,
      "one concurrent caller must recover the durable winner",
    );

    const replay = await client.rpc("persist_resume_elite_unlock", seed.args);
    assertEquals(replay.error, null);
    const replayResult = replay.data as Record<string, unknown>;
    assertEquals(replayResult.replayed, true);
    assertEquals(replayResult.analysis_id, leftResult.analysis_id);

    const { data: resume } = await client
      .from("resumes")
      .select("id, grading_data, analyzed_tier")
      .eq("id", seed.resumeId)
      .single();
    assertEquals(resume?.id, seed.resumeId);
    assertEquals(resume?.grading_data, unlockMerged());
    assertEquals(resume?.analyzed_tier, "elite");

    const { data: mirrors } = await client
      .from("analysis_results")
      .select("id, raw_response, key_insights")
      .eq("source_reference", seed.resumeId)
      .order("created_at", { ascending: true });
    assertEquals(mirrors?.length, 2);
    assertEquals(mirrors?.[0]?.id, seed.baseAnalysisId);
    assertEquals(mirrors?.[0]?.raw_response, unlockBase());
    assertEquals(
      (mirrors?.[1]?.key_insights as Record<string, unknown>)?.generation_mode,
      "incremental_unlock",
    );

    const { data: usage } = await client
      .from("usage_tracking")
      .select("analysis_id")
      .eq("id", seed.usageId)
      .single();
    assertEquals(usage?.analysis_id, leftResult.analysis_id);

    const { data: run } = await client
      .from("analysis_jobs")
      .select("state, merit_settled, refunded")
      .eq("id", seed.runId)
      .single();
    assertEquals(run, { state: "completed", merit_settled: true, refunded: false });

    const previewUrl = optionalEnv("SUPABASE_URL_STAGING") ||
      optionalEnv("STAGING_SUPABASE_URL") ||
      optionalEnv("SUPABASE_TEST_URL");
    const anonKey = optionalEnv("SUPABASE_ANON_KEY_STAGING") ||
      optionalEnv("SUPABASE_TEST_ANON_KEY") ||
      optionalEnv("STAGING_SUPABASE_ANON_KEY");
    const denied = await fetch(`${previewUrl}/rest/v1/rpc/persist_resume_elite_unlock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${seed.jwt}`,
      },
      body: JSON.stringify(seed.args),
    });
    const deniedStatus = denied.status;
    await denied.body?.cancel();
    assert(
      deniedStatus === 401 || deniedStatus === 403 || deniedStatus === 404,
      `authenticated RPC execution must be denied, got ${deniedStatus}`,
    );
  } finally {
    await cleanupUnlockSeed(seed);
  }
});
