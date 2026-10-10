// ── Phase 04.2 / Plan 05: DURABLE preview evidence for the costing ledgers ──────────────
//
// WHAT THIS LANE PROVES, AND WHY IT CANNOT BE A LOCAL MOCK
// -----------------------------------------------------------------------------
// Every other Phase 04.2 test asserts what the CODE intends. None of them can prove that
// the LIVE database accepted the row, enforced the constraint, applied the RLS deny, joined
// the four ledgers, or produced the exact monthly number a costing workbook will print.
// Those are properties of the deployed schema, not of the TypeScript. A local mock that
// "proves" them proves nothing.
//
// So this file writes real rows to the PREVIEW project through the service role, reads them
// back through the real reporting views, and asserts exact arithmetic. It is registered in
// deno.json's `test:remote` task ONLY -- never in `test:ci` -- so the offline lane stays
// hermetic.
//
// NO PAID PROVIDER CALL HAPPENS HERE. Every token count, page count, cost, and provider
// identifier below is a DETERMINISTIC FIXTURE VALUE inserted directly into the ledgers. The
// lane never invokes Anthropic, Mistral, or Textract, and never invokes an Edge Function
// that would. Provider behavior is already covered by the offline suites; what is untested
// without this file is the DATABASE.
//
// PRODUCTION SAFETY
// -----------------------------------------------------------------------------
// requireRemoteConfig() (shared with the lane preflight) refuses to run unless the target
// URL positively resolves to the preview ref `cimjltzovkahkqecpwgi`, and throws outright if
// it resolves to production `zjpjapgraoxdukdvpjes`. This file INSERTS AND DELETES ROWS and
// is therefore structurally incapable of touching production.
//
// THE TWO FIXTURE WINDOWS (and why one of them is in the future)
// -----------------------------------------------------------------------------
// The reporting views aggregate across ALL months. To assert an EXACT monthly total the
// fixture month must contain nothing but fixture rows. Two windows are used:
//
//   REPORT_MONTH     -- a month ~3 months in the FUTURE. Nothing else can possibly have
//                       written there, so the month is exclusively ours and the totals are
//                       exact rather than "greater than". Future-dating is safe: not one
//                       constraint, view, or retention boundary in this schema treats a
//                       future timestamp specially (retention only ever looks BACKWARD).
//   RETENTION_MONTH  -- ~26 months in the PAST, i.e. beyond the 24-month raw-retention
//                       boundary, so the scheduled rollup/prune function must aggregate it
//                       and then delete its raw rows.
//
// PRIVACY (D-15/D-17): every seeded value is synthetic. No prompt, no document text, no
// generated result, no email, and no real-person marker is written to any costing table --
// the schema has nowhere to put one, and this file does not invent a place.

import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  freshClient,
  optionalEnv,
  requireRemoteConfig,
  skipRemote,
} from "../_shared/__tests__/history-persistence-remote.ts";

// ── Fixture identity ────────────────────────────────────────────────────────────────────
// Every seeded row carries this marker in request_id / req_id so cleanup is exact and so a
// leaked row is identifiable as this lane's rather than a real one.
const RUN_TAG = `costing-05-${crypto.randomUUID()}`;

const startOfMonth = (offsetMonths: number): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1, 0, 0, 0, 0));
};

const REPORT_MONTH = startOfMonth(3);
const RETENTION_MONTH = startOfMonth(-26);

/** A deterministic timestamp inside a fixture month. */
const at = (month: Date, dayOffset: number, hour = 12): string =>
  new Date(month.getTime() + dayOffset * 86_400_000 + hour * 3_600_000).toISOString();

const monthKey = (month: Date): string => month.toISOString().slice(0, 10);

const PRODUCTION = "production";
const COMPLETE_EPOCH = "phase_04_2_complete";

type Client = Awaited<ReturnType<typeof freshClient>>;

/**
 * Fail loudly on any seeding error: a half-built fixture must never produce a green run.
 * `data` is accepted as unknown because PostgREST's generated row types collapse on an
 * untyped preview client; the caller states the shape it needs.
 */
function must<T>(
  label: string,
  result: { data: unknown; error: { message: string } | null },
): T {
  if (result.error) throw new Error(`FIXTURE SEED FAILED (${label}): ${result.error.message}`);
  if (result.data === null || result.data === undefined) {
    throw new Error(`FIXTURE SEED FAILED (${label}): no row returned`);
  }
  return result.data as T;
}

async function newSubject(client: Client): Promise<string> {
  const row = must<{ id: string }>(
    "costing_subjects",
    await client.from("costing_subjects").insert({}).select("id").single(),
  );
  return row.id;
}

interface RunSeed {
  subject: string;
  feature: string;
  variant?: string;
  status?: string;
  tier: string;
  period?: string | null;
  inputType?: string;
  documents?: number | null;
  environment?: string;
  excluded?: boolean;
  epoch?: string;
  cache?: boolean;
  cacheSource?: string | null;
  charged?: number | null;
  chargeKnown?: boolean;
  refunded?: number | null;
  refundKnown?: boolean;
  errorCode?: string | null;
  errorCategory?: string | null;
  actionKey?: string | null;
  startedAt: string;
  completedAt?: string | null;
  userId?: string | null;
}

async function seedRun(client: Client, seed: RunSeed): Promise<string> {
  const status = seed.status ?? "completed";
  const row = must<{ id: string }>(
    `feature_runs/${seed.feature}/${status}`,
    await client
      .from("feature_runs")
      .insert({
        request_id: RUN_TAG,
        server_action_key_hash: seed.actionKey ?? null,
        costing_subject_id: seed.subject,
        user_id: seed.userId ?? null,
        feature: seed.feature,
        run_variant: seed.variant ?? "standard",
        status,
        tier_at_time: seed.tier,
        subscription_period_at_time: seed.period ?? null,
        input_type: seed.inputType ?? "text",
        document_count: seed.documents ?? null,
        environment: seed.environment ?? PRODUCTION,
        exclude_from_costing_at_time: seed.excluded ?? false,
        costing_epoch: seed.epoch ?? COMPLETE_EPOCH,
        served_from_cache: seed.cache ?? false,
        cache_source: seed.cacheSource ?? null,
        merits_charged: seed.charged ?? null,
        merits_refunded: seed.refunded ?? null,
        merit_charge_known: seed.chargeKnown ?? seed.charged !== undefined,
        merit_refund_known: seed.refundKnown ?? seed.refunded !== undefined,
        error_code: seed.errorCode ?? null,
        error_category: seed.errorCategory ?? null,
        started_at: seed.startedAt,
        completed_at: status === "started" ? null : (seed.completedAt ?? seed.startedAt),
      })
      .select("id")
      .single(),
  );
  return row.id;
}

interface AiSeed {
  runId?: string | null;
  subject?: string | null;
  feature: string;
  tier: string;
  operation: string;
  attempt: number;
  isRetry: boolean;
  ok: boolean;
  model?: string;
  input?: number | null;
  output?: number | null;
  cacheWrite?: number | null;
  cacheRead?: number | null;
  cost?: number | null;
  costKnown: boolean;
  costConfidence: string;
  environment?: string;
  excluded?: boolean;
  epoch?: string | null;
  createdAt: string;
}

const HAIKU = "claude-haiku-4-5-20251001";

async function seedAi(client: Client, seed: AiSeed): Promise<number> {
  const row = must<{ id: number }>(
    `ai_call_telemetry/${seed.operation}#${seed.attempt}`,
    await client
      .from("ai_call_telemetry")
      .insert({
        created_at: seed.createdAt,
        started_at: seed.createdAt,
        completed_at: seed.createdAt,
        feature: seed.feature,
        tier: seed.tier,
        call_name: seed.operation,
        attempt: seed.attempt,
        req_id: RUN_TAG,
        feature_run_id: seed.runId ?? null,
        costing_subject_id: seed.subject ?? null,
        operation_name: seed.operation,
        attempt_number: seed.attempt,
        is_retry: seed.isRetry,
        provider: "anthropic",
        model: seed.model ?? HAIKU,
        max_tokens: 4000,
        input_tokens: seed.input ?? null,
        output_tokens: seed.output ?? null,
        cache_creation_input_tokens: seed.cacheWrite ?? null,
        cache_read_input_tokens: seed.cacheRead ?? null,
        ok: seed.ok,
        status: seed.ok ? "completed" : "failed",
        http_status: seed.ok ? 200 : 529,
        duration_ms: 1200,
        environment: seed.environment ?? PRODUCTION,
        exclude_from_costing_at_time: seed.excluded ?? false,
        costing_epoch: seed.epoch === null ? null : (seed.epoch ?? COMPLETE_EPOCH),
        telemetry_version: seed.epoch === null ? null : "04.2",
        incurred_cost_usd: seed.cost ?? null,
        cost_known: seed.costKnown,
        cost_confidence: seed.costConfidence,
      })
      .select("id")
      .single(),
  );
  return row.id;
}

interface DocSeed {
  runId: string;
  subject: string;
  ordinal?: number;
  feature: string;
  tier: string;
  fileType?: string;
  pages?: number | null;
  initial?: string;
  final?: string | null;
  extraction: string;
  ocr?: boolean;
  ocrReason?: string | null;
  ocrProvider?: string | null;
  ocrPages?: number | null;
  ocrAttempts?: number | null;
  ocrStatus?: string | null;
  reported?: number | null;
  calculated?: number | null;
  incurred?: number | null;
  variance?: number | null;
  costKnown: boolean;
  costConfidence: string;
  aiRowId?: number | null;
  environment?: string;
  excluded?: boolean;
  startedAt: string;
}

async function seedDoc(client: Client, seed: DocSeed): Promise<string> {
  const row = must<{ id: string }>(
    `document_processing_runs/${seed.extraction}`,
    await client
      .from("document_processing_runs")
      .insert({
        feature_run_id: seed.runId,
        costing_subject_id: seed.subject,
        request_id: RUN_TAG,
        document_ordinal: seed.ordinal ?? 1,
        feature: seed.feature,
        tier_at_time: seed.tier,
        environment: seed.environment ?? PRODUCTION,
        exclude_from_costing_at_time: seed.excluded ?? false,
        costing_epoch: COMPLETE_EPOCH,
        file_type: seed.fileType ?? "pdf",
        page_count: seed.pages ?? null,
        initial_extractor: seed.initial ?? "pdf_parser",
        final_extractor: seed.final ?? null,
        extraction_status: seed.extraction,
        ocr_triggered: seed.ocr ?? false,
        ocr_trigger_reason: seed.ocrReason ?? null,
        ocr_provider: seed.ocrProvider ?? null,
        ocr_pages: seed.ocrPages ?? null,
        ocr_attempt_count: seed.ocrAttempts ?? null,
        ocr_status: seed.ocrStatus ?? null,
        provider_reported_cost_usd: seed.reported ?? null,
        calculated_cost_usd: seed.calculated ?? null,
        incurred_cost_usd: seed.incurred ?? null,
        cost_variance_usd: seed.variance ?? null,
        cost_known: seed.costKnown,
        cost_confidence: seed.costConfidence,
        ai_call_telemetry_id: seed.aiRowId ?? null,
        started_at: seed.startedAt,
        completed_at: seed.startedAt,
      })
      .select("id")
      .single(),
  );
  return row.id;
}

// ── The seeded world ────────────────────────────────────────────────────────────────────
// Memoized: one seed for the whole FILE. Deno runs test files in parallel workers but the
// tests inside one file run sequentially, so a single shared fixture is race-free here.

/**
 * A fixture subject that a complete monthly report MUST count as one distinct product-MAU
 * user, together with the tier/period bucket it lands in.
 */
interface CountableSubject {
  name: string;
  subject: string;
  tier: string;
  period: string | null;
}

/** A fixture subject that a complete monthly report MUST NOT count, and exactly why. */
interface UncountableSubject {
  name: string;
  subject: string;
  reason: string;
}

interface Seeded {
  client: Client;
  subjects: string[];
  runIds: string[];
  // ── The MAU registries ────────────────────────────────────────────────────────────────
  // Expectations are DERIVED from these lists, never restated as a hand-counted literal.
  // The first version of this file asserted `6` beside a comment that enumerated SEVEN
  // subjects; the number and the prose disagreed and only the live preview push caught it.
  // With the registries the enumeration IS the expectation, so they cannot drift apart --
  // and buildWorld() proves every seeded subject appears in exactly one of them, so adding
  // a fixture subject without classifying it fails loudly instead of silently shifting a
  // total.
  mauCountable: CountableSubject[];
  mauUncountable: UncountableSubject[];
  // ── The run registries ────────────────────────────────────────────────────────────────
  // Same discipline for feature-usage counts, which the same literal hazard applies to.
  completedIncludedRuns: string[];
  failedIncludedRuns: string[];
  canceledIncludedRuns: string[];
  filteredOutRuns: string[];
  // ── The provider-spend expectations ───────────────────────────────────────────────────
  // Computed in TypeScript from the fixture declarations, then compared against what SQL
  // computed from the same rows. The two arithmetics are independent, so agreement is
  // evidence about the VIEW rather than a restatement of the fixture.
  expectedAi: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    retryCalls: number;
    unknownCostAttempts: number;
    knownCostUsd: number;
    retryCostUsd: number;
    inputTokens: number;
  };
  expectedDocuments: {
    documentsProcessed: number;
    parsedWithoutOcr: number;
    ocrDocuments: number;
    ocrRetryDocuments: number;
    ocrFailures: number;
    totalOcrPages: number;
    knownCostUsd: number;
    unknownCostDocumentsViewDefinition: number;
    genuinelyUnpricedDocuments: number;
  };
  freeRun: string;
  eliteMonthlyRun: string;
  eliteAnnualRun: string;
  refundedRun: string;
  cacheRun: string;
  ocrRun: string;
  claudeOcrRun: string;
  claudeAiRowId: number;
  interviewAnalyzeRun: string;
  interviewEvaluateRun: string;
  excludedRun: string;
  developmentRun: string;
  duplicateActionKey: string;
}

let seededPromise: Promise<Seeded> | null = null;
const seedWorld = (): Promise<Seeded> => (seededPromise ??= buildWorld());

async function buildWorld(): Promise<Seeded> {
  const client = await freshClient();

  // PRECONDITION. The exact-total assertions below are only meaningful if the report month
  // is exclusively ours. Fail loudly rather than silently degrading to "greater than".
  const { count: preexisting, error: preError } = await client
    .from("feature_runs")
    .select("id", { count: "exact", head: true })
    .gte("started_at", REPORT_MONTH.toISOString())
    .lt("started_at", startOfMonth(4).toISOString());
  if (preError) {
    throw new Error(`FIXTURE PRECONDITION FAILED: could not probe the report month: ${preError.message}`);
  }
  assertEquals(
    preexisting ?? 0,
    0,
    `FIXTURE PRECONDITION FAILED: the report month ${monthKey(REPORT_MONTH)} already holds ` +
      "feature runs. Exact monthly totals require an exclusively-owned month; clean up the " +
      "leftover rows (they are almost certainly from an interrupted earlier run of this lane).",
  );

  const subjects: string[] = [];
  const runIds: string[] = [];
  const subject = async () => {
    const id = await newSubject(client);
    subjects.push(id);
    return id;
  };
  const run = async (seed: RunSeed) => {
    const id = await seedRun(client, seed);
    runIds.push(id);
    return id;
  };

  // Collect every AI/document fixture as it is seeded, so the monthly expectations below are
  // DERIVED from the fixture declaration instead of hand-counted. Same discipline, and same
  // motivation, as the MAU registries: a hand-counted total is a number nobody re-checks.
  const aiSeeds: AiSeed[] = [];
  const docSeeds: DocSeed[] = [];
  const ai = async (seed: AiSeed) => {
    const id = await seedAi(client, seed);
    aiSeeds.push(seed);
    return id;
  };
  const doc = async (seed: DocSeed) => {
    const id = await seedDoc(client, seed);
    docSeeds.push(seed);
    return id;
  };

  // ── CASE 1: Free tier, successful resume analysis, one required AI operation ──────────
  const freeSubject = await subject();
  const freeRun = await run({
    subject: freeSubject,
    feature: "resume_analysis",
    tier: "free",
    period: null,
    inputType: "pdf",
    documents: 1,
    charged: 1,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 1),
  });
  await ai({
    runId: freeRun,
    subject: freeSubject,
    feature: "resume_analysis",
    tier: "free",
    operation: "resume_score",
    attempt: 1,
    isRetry: false,
    ok: true,
    input: 1000,
    output: 500,
    cacheWrite: 0,
    cacheRead: 0,
    // 1000 * $1.00/M + 500 * $5.00/M = 0.001 + 0.0025
    cost: 0.0035,
    costKnown: true,
    costConfidence: "calculated",
    createdAt: at(REPORT_MONTH, 1),
  });
  // CASE 9: normal PDF extraction, no OCR. verified_zero is the ONE legitimate zero.
  await doc({
    runId: freeRun,
    subject: freeSubject,
    feature: "resume_analysis",
    tier: "free",
    pages: 2,
    initial: "pdf_parser",
    final: "pdf_parser",
    extraction: "completed",
    ocr: false,
    incurred: 0,
    costKnown: true,
    costConfidence: "verified_zero",
    startedAt: at(REPORT_MONTH, 1),
  });

  // ── CASE 2: monthly Elite, multi-step feature (3 REQUIRED operations, no retries) ─────
  const eliteMonthlySubject = await subject();
  const eliteMonthlyRun = await run({
    subject: eliteMonthlySubject,
    feature: "career_compass",
    tier: "elite",
    period: "monthly",
    charged: 2,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 2),
  });
  for (const [index, operation] of ["career_parse", "career_score", "career_recommendations"].entries()) {
    await ai({
      runId: eliteMonthlyRun,
      subject: eliteMonthlySubject,
      feature: "career_compass",
      tier: "elite",
      operation,
      attempt: 1,
      isRetry: false,
      ok: true,
      input: 2000,
      output: 1000,
      cacheWrite: 0,
      cacheRead: 0,
      // 2000/M * 1.00 + 1000/M * 5.00 = 0.002 + 0.005
      cost: 0.007,
      costKnown: true,
      costConfidence: "calculated",
      createdAt: at(REPORT_MONTH, 2, 12 + index),
    });
  }

  // ── CASE 3: annual Elite, successful run ─────────────────────────────────────────────
  const eliteAnnualSubject = await subject();
  const eliteAnnualRun = await run({
    subject: eliteAnnualSubject,
    feature: "recruiting_lens",
    tier: "elite",
    period: "annual",
    charged: 2,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 3),
  });
  await ai({
    runId: eliteAnnualRun,
    subject: eliteAnnualSubject,
    feature: "recruiting_lens",
    tier: "elite",
    operation: "recruiting_score",
    attempt: 1,
    isRetry: false,
    ok: true,
    input: 3000,
    output: 1500,
    cacheWrite: 0,
    cacheRead: 0,
    cost: 0.0105,
    costKnown: true,
    costConfidence: "calculated",
    createdAt: at(REPORT_MONTH, 3),
  });

  // ── CASE 4 + 6 + 7: failed run, Merit refunded, spend RETAINED, failed-then-retry ─────
  // The retried operation burns real tokens on attempt 1 (failed, cost UNKNOWN because the
  // provider returned no usage) and again on attempt 2. Refunding the Merit must not erase
  // either. BRIEF s9.
  const refundSubject = await subject();
  const refundedRun = await run({
    subject: refundSubject,
    feature: "linkedin_grader",
    tier: "elite",
    period: "monthly",
    status: "failed",
    charged: 1,
    refunded: 1,
    errorCode: "provider_overloaded",
    errorCategory: "provider",
    startedAt: at(REPORT_MONTH, 4),
  });
  await ai({
    runId: refundedRun,
    subject: refundSubject,
    feature: "linkedin_grader",
    tier: "elite",
    operation: "linkedin_score",
    attempt: 1,
    isRetry: false,
    ok: false,
    input: null,
    output: null,
    cacheWrite: null,
    cacheRead: null,
    cost: null,
    costKnown: false,
    costConfidence: "unknown",
    createdAt: at(REPORT_MONTH, 4, 12),
  });
  await ai({
    runId: refundedRun,
    subject: refundSubject,
    feature: "linkedin_grader",
    tier: "elite",
    operation: "linkedin_score",
    attempt: 2,
    isRetry: true,
    ok: true,
    input: 500,
    output: 100,
    cacheWrite: 0,
    cacheRead: 0,
    // 500/M * 1.00 + 100/M * 5.00 = 0.0005 + 0.0005
    cost: 0.001,
    costKnown: true,
    costConfidence: "calculated",
    createdAt: at(REPORT_MONTH, 4, 13),
  });

  // ── LOCKED CASE: cache hit adds ZERO AI attempts but is still a countable run ─────────
  const cacheSubject = await subject();
  const cacheRun = await run({
    subject: cacheSubject,
    feature: "resume_analysis",
    variant: "cache_reuse",
    tier: "free",
    period: null,
    cache: true,
    cacheSource: "analysis_cache",
    charged: 0,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 5),
  });

  // ── CASE 10 + 11 + 12: OCR triggered, OCR retry, OCR failure ─────────────────────────
  const ocrSubject = await subject();
  const ocrRun = await run({
    subject: ocrSubject,
    feature: "resume_analysis",
    tier: "elite",
    period: "monthly",
    inputType: "pdf",
    documents: 3,
    charged: 1,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 6),
  });
  // 10: Mistral OCR, priced from PROVEN page billing. 3 pages @ $4.00/1000 = 0.012
  await doc({
    runId: ocrRun,
    subject: ocrSubject,
    ordinal: 1,
    feature: "resume_analysis",
    tier: "elite",
    pages: 3,
    initial: "pdf_parser",
    final: "mistral",
    extraction: "empty",
    ocr: true,
    ocrReason: "empty_extraction",
    ocrProvider: "mistral",
    ocrPages: 3,
    ocrAttempts: 1,
    ocrStatus: "completed",
    // D-11: BOTH values preserved; incurred follows the reported figure; variance exposed.
    reported: 0.0125,
    calculated: 0.012,
    incurred: 0.0125,
    variance: 0.0005,
    costKnown: true,
    costConfidence: "reported",
    startedAt: at(REPORT_MONTH, 6, 12),
  });
  // 11: OCR RETRY. ocr_attempt_count includes the initial attempt (BRIEF s13).
  await doc({
    runId: ocrRun,
    subject: ocrSubject,
    ordinal: 2,
    feature: "resume_analysis",
    tier: "elite",
    pages: 2,
    initial: "pdf_parser",
    final: "mistral",
    extraction: "insufficient_text",
    ocr: true,
    ocrReason: "insufficient_text",
    ocrProvider: "mistral",
    ocrPages: 2,
    ocrAttempts: 2,
    ocrStatus: "completed",
    calculated: 0.008,
    incurred: 0.008,
    costKnown: true,
    costConfidence: "calculated",
    startedAt: at(REPORT_MONTH, 6, 13),
  });
  // 12: OCR FAILURE. No pages billed, no reported amount -> UNKNOWN cost, never zero (D-13).
  await doc({
    runId: ocrRun,
    subject: ocrSubject,
    ordinal: 3,
    feature: "resume_analysis",
    tier: "elite",
    pages: 4,
    initial: "pdf_parser",
    final: "mistral",
    extraction: "failed",
    ocr: true,
    ocrReason: "parser_error",
    ocrProvider: "mistral",
    ocrPages: null,
    ocrAttempts: 2,
    ocrStatus: "failed",
    costKnown: false,
    costConfidence: "unknown",
    startedAt: at(REPORT_MONTH, 6, 14),
  });

  // ── LOCKED CASE: Claude vision OCR is counted EXACTLY ONCE (D-12) ─────────────────────
  // The AI row owns the money. The document row owns only the REFERENCE.
  const claudeSubject = await subject();
  const claudeOcrRun = await run({
    subject: claudeSubject,
    feature: "career_compass",
    tier: "elite",
    period: "annual",
    inputType: "pdf",
    documents: 1,
    charged: 2,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 7),
  });
  const claudeAiRowId = await ai({
    runId: claudeOcrRun,
    subject: claudeSubject,
    feature: "career_compass",
    tier: "elite",
    operation: "document_ocr",
    attempt: 1,
    isRetry: false,
    ok: true,
    input: 4000,
    output: 800,
    cacheWrite: 0,
    cacheRead: 0,
    // 4000/M * 1.00 + 800/M * 5.00 = 0.004 + 0.004
    cost: 0.008,
    costKnown: true,
    costConfidence: "calculated",
    createdAt: at(REPORT_MONTH, 7),
  });
  await doc({
    runId: claudeOcrRun,
    subject: claudeSubject,
    feature: "career_compass",
    tier: "elite",
    pages: 1,
    initial: "pdf_parser",
    final: "claude_ocr",
    extraction: "empty",
    ocr: true,
    ocrReason: "scanned_document",
    ocrProvider: "anthropic",
    ocrPages: 1,
    ocrAttempts: 1,
    ocrStatus: "completed",
    costKnown: false,
    costConfidence: "referenced_ai",
    aiRowId: claudeAiRowId,
    startedAt: at(REPORT_MONTH, 7),
  });

  // ── LOCKED CASE: Interview Prep analyze + evaluation are separately countable ─────────
  // 04.2-04 established that the shipped run_variant CHECK has no `analyze` value, so
  // analyze records the canonical `standard` and evaluation records `evaluation`.
  const interviewSubject = await subject();
  const interviewAnalyzeRun = await run({
    subject: interviewSubject,
    feature: "interview_prep",
    variant: "standard",
    tier: "elite",
    period: "monthly",
    charged: 1,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 8, 10),
  });
  const interviewEvaluateRun = await run({
    subject: interviewSubject,
    feature: "interview_prep",
    variant: "evaluation",
    tier: "elite",
    period: "monthly",
    charged: 0,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 8, 11),
  });

  // ── CASE 13 + LOCKED CASE: environment and exclusion separation ───────────────────────
  // Both of these are INVISIBLE to every complete report. They exist to prove the filters
  // actually filter, rather than to be counted.
  const developmentSubject = await subject();
  const developmentRun = await run({
    subject: developmentSubject,
    feature: "resume_analysis",
    tier: "free",
    period: null,
    environment: "development",
    charged: 1,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 9),
  });
  const excludedSubject = await subject();
  const excludedRun = await run({
    subject: excludedSubject,
    feature: "resume_analysis",
    tier: "elite",
    period: "monthly",
    excluded: true,
    charged: 1,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 9, 13),
  });
  await ai({
    runId: excludedRun,
    subject: excludedSubject,
    feature: "resume_analysis",
    tier: "elite",
    operation: "resume_score",
    attempt: 1,
    isRetry: false,
    ok: true,
    input: 9_000_000,
    output: 9_000_000,
    cacheWrite: 0,
    cacheRead: 0,
    cost: 999.0,
    costKnown: true,
    costConfidence: "calculated",
    excluded: true,
    createdAt: at(REPORT_MONTH, 9, 13),
  });

  // ── LOCKED CASE: legacy pre-04.2 AI-only row ─────────────────────────────────────────
  // No feature run, no epoch, no environment. It must appear ONLY in the partial legacy
  // view and must never reach a complete joined total (D-05/D-08).
  await ai({
    runId: null,
    subject: null,
    feature: "resume_analysis",
    tier: "free",
    operation: "legacy_score",
    attempt: 1,
    isRetry: false,
    ok: true,
    input: 7_777_777,
    output: 7_777_777,
    cacheWrite: 0,
    cacheRead: 0,
    cost: null,
    costKnown: false,
    costConfidence: "unknown",
    epoch: null,
    createdAt: at(REPORT_MONTH, 10),
  });

  // ── Classify every seeded subject and run, then prove the classification is total ──────
  // This is the guard that the original hand-counted literals lacked.

  const mauCountable: CountableSubject[] = [
    { name: "free", subject: freeSubject, tier: "free", period: null },
    { name: "elite monthly", subject: eliteMonthlySubject, tier: "elite", period: "monthly" },
    { name: "elite annual", subject: eliteAnnualSubject, tier: "elite", period: "annual" },
    { name: "cache reuse", subject: cacheSubject, tier: "free", period: null },
    { name: "OCR", subject: ocrSubject, tier: "elite", period: "monthly" },
    { name: "Claude OCR", subject: claudeSubject, tier: "elite", period: "annual" },
    // ONE subject, two runs (analyze + evaluation). The collapse is the behavior the MAU
    // assertion exists to protect: if it ever broke, the distinct count would rise by one.
    { name: "interview prep (analyze + evaluation)", subject: interviewSubject, tier: "elite", period: "monthly" },
  ];

  const mauUncountable: UncountableSubject[] = [
    { name: "failed LinkedIn run", subject: refundSubject, reason: "status is failed, and MAU counts completed runs only" },
    { name: "development run", subject: developmentSubject, reason: "environment is not production" },
    { name: "excluded account", subject: excludedSubject, reason: "the exclude_from_costing_at_time snapshot is true" },
  ];

  const completedIncludedRuns = [
    freeRun,
    eliteMonthlyRun,
    eliteAnnualRun,
    cacheRun,
    ocrRun,
    claudeOcrRun,
    interviewAnalyzeRun,
    interviewEvaluateRun,
  ];
  const failedIncludedRuns = [refundedRun];
  const canceledIncludedRuns: string[] = [];
  const filteredOutRuns = [developmentRun, excludedRun];

  // TOTALITY. Every seeded subject/run must be classified exactly once. Without this, a
  // future fixture addition silently changes a derived total and the lane keeps passing
  // against the wrong number -- which is precisely how the `6` survived Task 1.
  const classifiedSubjects = new Set([
    ...mauCountable.map((entry) => entry.subject),
    ...mauUncountable.map((entry) => entry.subject),
  ]);
  assertEquals(
    classifiedSubjects.size,
    subjects.length,
    "FIXTURE CLASSIFICATION INCOMPLETE: every seeded costing subject must appear in exactly " +
      "one of mauCountable / mauUncountable. An unclassified subject would shift every " +
      "derived MAU expectation without failing anything.",
  );

  const classifiedRuns = new Set([
    ...completedIncludedRuns,
    ...failedIncludedRuns,
    ...canceledIncludedRuns,
    ...filteredOutRuns,
  ]);
  assertEquals(
    classifiedRuns.size,
    runIds.length,
    "FIXTURE CLASSIFICATION INCOMPLETE: every seeded feature run must appear in exactly one " +
      "run registry.",
  );

  // A fixture reaches a COMPLETE monthly report only if it is production, not excluded, and
  // in the complete epoch. These three predicates mirror the three default report filters --
  // stated once here rather than re-derived at each assertion.
  const includedAi = aiSeeds.filter((seed) =>
    (seed.environment ?? PRODUCTION) === PRODUCTION &&
    seed.excluded !== true &&
    seed.epoch !== null
  );
  const includedDocs = docSeeds.filter((seed) =>
    (seed.environment ?? PRODUCTION) === PRODUCTION && seed.excluded !== true
  );
  const sum = <T>(items: T[], pick: (item: T) => number | null | undefined): number =>
    items.reduce((total, item) => total + (pick(item) ?? 0), 0);

  const expectedAi = {
    totalCalls: includedAi.length,
    successfulCalls: includedAi.filter((seed) => seed.ok).length,
    failedCalls: includedAi.filter((seed) => !seed.ok).length,
    retryCalls: includedAi.filter((seed) => seed.isRetry).length,
    unknownCostAttempts: includedAi.filter((seed) => !seed.costKnown).length,
    knownCostUsd: sum(includedAi.filter((seed) => seed.costKnown), (seed) => seed.cost),
    retryCostUsd: sum(includedAi.filter((seed) => seed.costKnown && seed.isRetry), (seed) => seed.cost),
    inputTokens: sum(includedAi, (seed) => seed.input),
  };

  const expectedDocuments = {
    documentsProcessed: includedDocs.length,
    parsedWithoutOcr: includedDocs.filter((seed) => seed.ocr !== true && seed.extraction === "completed").length,
    ocrDocuments: includedDocs.filter((seed) => seed.ocr === true).length,
    ocrRetryDocuments: includedDocs.filter((seed) => (seed.ocrAttempts ?? 0) > 1).length,
    ocrFailures: includedDocs.filter((seed) => seed.ocrStatus === "failed").length,
    totalOcrPages: sum(includedDocs, (seed) => seed.ocrPages),
    knownCostUsd: sum(includedDocs.filter((seed) => seed.costKnown), (seed) => seed.incurred),
    // The view's coarser predicate (see the A4 caveat in costing_telemetry_report.sql):
    // referenced-AI documents are cost_known = false and therefore counted here too.
    unknownCostDocumentsViewDefinition: includedDocs.filter(
      (seed) => seed.ocr === true && !seed.costKnown,
    ).length,
    // Block E4's refined register: referenced-AI spend IS known, just owned by the AI row.
    genuinelyUnpricedDocuments: includedDocs.filter(
      (seed) => seed.ocr === true && !seed.costKnown && seed.costConfidence !== "referenced_ai",
    ).length,
  };

  return {
    client,
    subjects,
    runIds,
    expectedAi,
    expectedDocuments,
    mauCountable,
    mauUncountable,
    completedIncludedRuns,
    failedIncludedRuns,
    canceledIncludedRuns,
    filteredOutRuns,
    freeRun,
    eliteMonthlyRun,
    eliteAnnualRun,
    refundedRun,
    cacheRun,
    ocrRun,
    claudeOcrRun,
    claudeAiRowId,
    interviewAnalyzeRun,
    interviewEvaluateRun,
    excludedRun,
    developmentRun,
    duplicateActionKey: `${RUN_TAG}-action`,
  };
}

// ── Reporting helpers ───────────────────────────────────────────────────────────────────
// Each reads the REAL view with the SAME default filters the canonical SQL uses, scoped to
// the exclusively-owned report month.

async function viewRows(
  client: Client,
  view: string,
  month: Date,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await client.from(view).select("*").eq("month", monthKey(month));
  if (error) throw new Error(`${view} query failed: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const sumOf = (rows: Array<Record<string, unknown>>, column: string): number =>
  rows.reduce((total, row) => total + num(row[column]), 0);

// ════════════════════════════════════════════════════════════════════════════════════════
// TESTS
// ════════════════════════════════════════════════════════════════════════════════════════

Deno.test("costing-remote: preview target is proven non-production before any row is written", () => {
  if (skipRemote("costing target proof")) return;
  const { url } = requireRemoteConfig();
  assert(
    url.includes("cimjltzovkahkqecpwgi"),
    "This lane INSERTS AND DELETES costing rows; it may only ever run against preview.",
  );
  assert(!url.includes("zjpjapgraoxdukdvpjes"), "Refusing to write costing fixtures to production.");
});

Deno.test("costing-remote: one feature run joins Merit, document, AI, and terminal evidence", async () => {
  if (skipRemote("joined per-run evidence")) return;
  const world = await seedWorld();

  const { data: run, error } = await world.client
    .from("feature_runs")
    // ONE string literal, deliberately. A concatenated projection collapses the generated
    // PostgREST row type to GenericStringError (seen in 04.2-03), which silently erases
    // every column assertion below.
    .select(
      "id, feature, run_variant, status, tier_at_time, subscription_period_at_time, input_type, document_count, merits_charged, merits_refunded, merit_charge_known, merit_refund_known, error_code, error_category, completed_at, environment, exclude_from_costing_at_time, costing_epoch",
    )
    .eq("id", world.refundedRun)
    .single();
  if (error) throw new Error(`feature_runs query failed: ${error.message}`);

  // Terminal + Merit truth, exact values (not "truthy").
  assertEquals(run.status, "failed");
  assertEquals(run.merits_charged, 1);
  assertEquals(run.merits_refunded, 1);
  assertEquals(run.merit_charge_known, true);
  assertEquals(run.merit_refund_known, true);
  assertEquals(run.error_category, "provider");
  assertExists(run.completed_at);

  // Provider spend SURVIVES the refund. This is the whole point of BRIEF s9: a refunded
  // Merit is a customer-facing correction, not a reversal of money we already paid.
  const { data: attempts, error: aiError } = await world.client
    .from("ai_call_telemetry")
    .select("operation_name, attempt_number, is_retry, ok, incurred_cost_usd, cost_known, cost_confidence")
    .eq("feature_run_id", world.refundedRun)
    .order("attempt_number");
  if (aiError) throw new Error(`ai_call_telemetry query failed: ${aiError.message}`);
  assertEquals(attempts.length, 2);
  assertEquals(attempts[0].is_retry, false);
  assertEquals(attempts[0].ok, false);
  assertEquals(attempts[0].cost_known, false);
  assertEquals(attempts[0].incurred_cost_usd, null, "A failed attempt with no usage is UNKNOWN, never 0.");
  assertEquals(attempts[1].is_retry, true);
  assertEquals(attempts[1].attempt_number, 2);
  assertEquals(attempts[1].cost_known, true);
  assertAlmostEquals(Number(attempts[1].incurred_cost_usd), 0.001, 1e-9);

  // A multi-step run's separate operations are REQUIRED STEPS, not retries.
  const { data: steps } = await world.client
    .from("ai_call_telemetry")
    .select("operation_name, is_retry")
    .eq("feature_run_id", world.eliteMonthlyRun);
  assertEquals(steps?.length, 3);
  assertEquals(steps?.every((step) => step.is_retry === false), true);
  assertEquals(new Set(steps?.map((step) => step.operation_name)).size, 3);

  // A cache hit is a countable run that adds NO provider spend.
  const { count: cacheAttempts } = await world.client
    .from("ai_call_telemetry")
    .select("id", { count: "exact", head: true })
    .eq("feature_run_id", world.cacheRun);
  assertEquals(cacheAttempts ?? 0, 0);
});

Deno.test("costing-remote: monthly product MAU counts completed production subjects only", async () => {
  if (skipRemote("product MAU")) return;
  const world = await seedWorld();
  const rows = await viewRows(world.client, "costing_monthly_product_mau", REPORT_MONTH);

  // Completed + production + included + complete-epoch subjects only. The expectation is
  // DERIVED from the registry, so the number and its enumeration cannot disagree.
  //
  // Summing active_users across rows is sound here because no fixture subject appears in
  // more than one (tier, period) bucket -- the registry states each subject's single bucket,
  // and the assertion below re-checks the annual slice against that same source.
  const total = sumOf(rows, "active_users");
  assertEquals(
    total,
    world.mauCountable.length,
    `Expected exactly ${world.mauCountable.length} distinct completed production subjects: ` +
      `${world.mauCountable.map((entry) => entry.name).join(", ")}. Excluded by design: ` +
      `${world.mauUncountable.map((entry) => `${entry.name} (${entry.reason})`).join("; ")}.`,
  );

  // Every row must carry the provenance marker so a copied cell can never be mistaken for
  // Supabase billable Auth MAU.
  assertEquals(
    rows.every((row) => row.metric_definition === "product_mau_not_supabase_auth_mau"),
    true,
  );

  // The tier/period snapshot is preserved, including the annual Elite split -- again derived
  // from the registry rather than restated.
  const expectedAnnual = world.mauCountable.filter((entry) => entry.period === "annual").length;
  const annual = rows.filter((row) => row.subscription_period_at_time === "annual");
  assertEquals(sumOf(annual, "active_users"), expectedAnnual);
});

Deno.test("costing-remote: monthly feature usage totals match the fixtures exactly", async () => {
  if (skipRemote("feature usage")) return;
  const world = await seedWorld();
  const rows = await viewRows(world.client, "costing_monthly_feature_usage", REPORT_MONTH);

  // Derived from the run registries, not hand-counted.
  const startedExpected = world.completedIncludedRuns.length +
    world.failedIncludedRuns.length +
    world.canceledIncludedRuns.length;
  assertEquals(
    sumOf(rows, "started_runs"),
    startedExpected,
    `Every included production run is counted once (${startedExpected} seeded); the ` +
      `${world.filteredOutRuns.length} filtered-out runs are counted zero times.`,
  );
  assertEquals(sumOf(rows, "completed_runs"), world.completedIncludedRuns.length);
  assertEquals(sumOf(rows, "failed_runs"), world.failedIncludedRuns.length);
  assertEquals(sumOf(rows, "canceled_runs"), world.canceledIncludedRuns.length);

  // Merit totals sum only OBSERVED settlements. Written as the per-run addition rather than
  // a collapsed literal so a changed fixture amount is visible at the assertion.
  const meritsCharged = 1 /* free */ + 2 /* elite monthly */ + 2 /* elite annual */ +
    1 /* refunded (charged then refunded) */ + 0 /* cache reuse */ + 1 /* OCR */ +
    2 /* Claude OCR */ + 1 /* interview analyze */ + 0 /* interview evaluation */;
  assertEquals(sumOf(rows, "merits_charged"), meritsCharged);
  assertEquals(sumOf(rows, "merits_refunded"), world.failedIncludedRuns.length);

  // Interview Prep's analyze and evaluation are separately countable under ONE feature.
  const interview = rows.filter((row) => row.feature === "interview_prep");
  assertEquals(sumOf(interview, "started_runs"), 2);
  assertEquals(sumOf(interview, "unique_users"), 1, "Two variants, one distinct subject.");
});

Deno.test("costing-remote: monthly AI usage separates retries, failures, and unknown cost", async () => {
  if (skipRemote("AI usage")) return;
  const world = await seedWorld();
  const rows = await viewRows(world.client, "costing_monthly_ai_usage", REPORT_MONTH);

  // Every expectation is derived from the seeded AI fixtures, so SQL's arithmetic is checked
  // against an independent TypeScript arithmetic over the same rows.
  const expected = world.expectedAi;
  assertEquals(sumOf(rows, "total_calls"), expected.totalCalls);
  assertEquals(sumOf(rows, "successful_calls"), expected.successfulCalls);
  assertEquals(sumOf(rows, "failed_calls"), expected.failedCalls);
  assertEquals(sumOf(rows, "retry_calls"), expected.retryCalls);
  assertEquals(sumOf(rows, "unknown_cost_attempts"), expected.unknownCostAttempts);

  assertAlmostEquals(sumOf(rows, "known_incurred_cost_usd"), expected.knownCostUsd, 1e-9);
  assertAlmostEquals(sumOf(rows, "retry_incurred_cost_usd"), expected.retryCostUsd, 1e-9);
  // The one failed attempt has UNKNOWN cost, so failed-cost is 0 KNOWN dollars while the
  // unknown counter above is non-zero. Those two facts must be read together (D-13).
  assertEquals(sumOf(rows, "failed_incurred_cost_usd"), 0);
  assert(expected.unknownCostAttempts > 0, "The fixture must keep at least one unpriced attempt.");

  // The excluded account's deliberately absurd $999 attempt is nowhere in this month. This
  // one stays a bare literal ON PURPOSE: it is an independent order-of-magnitude tripwire,
  // not a restatement of the fixture, so it still fires if the derivation itself is wrong.
  assert(sumOf(rows, "known_incurred_cost_usd") < 1, "An excluded account leaked into complete AI totals.");
  assertEquals(sumOf(rows, "input_tokens"), expected.inputTokens);
});

Deno.test("costing-remote: monthly document usage prices OCR and counts Claude vision once", async () => {
  if (skipRemote("document usage")) return;
  const world = await seedWorld();
  const rows = await viewRows(world.client, "costing_monthly_document_usage", REPORT_MONTH);

  const expected = world.expectedDocuments;
  assertEquals(sumOf(rows, "documents_processed"), expected.documentsProcessed);
  assertEquals(sumOf(rows, "documents_parsed_without_ocr"), expected.parsedWithoutOcr);
  assertEquals(sumOf(rows, "ocr_documents"), expected.ocrDocuments);
  assertEquals(sumOf(rows, "ocr_retry_documents"), expected.ocrRetryDocuments);
  assertEquals(sumOf(rows, "ocr_failures"), expected.ocrFailures);
  assertEquals(
    sumOf(rows, "total_ocr_pages"),
    expected.totalOcrPages,
    "The failed OCR billed no pages, so it contributes nothing to the page total.",
  );

  // D-12. Document-owned spend is Mistral only. The Claude vision document contributes
  // NOTHING here because its money lives on the AI row (already counted above) -- the
  // derivation sums incurred cost, which is NULL on a referenced-AI row.
  assertAlmostEquals(sumOf(rows, "known_incurred_cost_usd"), expected.knownCostUsd, 1e-9);
  // TWO documents land in the view's unknown_cost_documents: the failed OCR (genuinely
  // unpriced) AND the Claude vision document (cost_known = false because its money lives on
  // the referenced AI row). The view's predicate is `ocr_triggered AND cost_known IS
  // DISTINCT FROM true`, which does NOT special-case cost_confidence = 'referenced_ai'.
  //
  // That is a LABELLING nuance, not a lost dollar: the Claude spend is fully counted in
  // Block A3. It does mean the view's raw counter overstates "cost we could not establish"
  // by the number of referenced-AI documents, so the canonical SQL's Block E4 unknown-cost
  // register subtracts them and Block A4 documents the difference. Asserted here on both
  // definitions so the two can never silently diverge.
  assertEquals(
    sumOf(rows, "unknown_cost_documents"),
    expected.unknownCostDocumentsViewDefinition,
    "View definition: genuinely unpriced OCR plus every referenced-AI document.",
  );
  const { data: genuinelyUnknown, error: unknownError } = await world.client
    .from("document_processing_runs")
    .select("id")
    .eq("request_id", RUN_TAG)
    .eq("ocr_triggered", true)
    .neq("cost_confidence", "referenced_ai")
    .not("cost_known", "is", true);
  if (unknownError) throw new Error(`unknown-cost register probe failed: ${unknownError.message}`);
  assertEquals(
    genuinelyUnknown?.length ?? 0,
    expected.genuinelyUnpricedDocuments,
    "Refined definition (canonical SQL Block E4): only the failed OCR is truly unpriced.",
  );
  assert(
    expected.unknownCostDocumentsViewDefinition > expected.genuinelyUnpricedDocuments,
    "The fixture must keep at least one referenced-AI document, or this reconciliation " +
      "asserts nothing and the A4 caveat goes unproven.",
  );

  // Safe division: the incidence/average columns are numeric, never a division error.
  for (const row of rows) {
    if (num(row.documents_processed) > 0) assertExists(row.ocr_incidence);
  }

  // The read-side proof of the no-double-count CHECK, on the LIVE database.
  const { data: doubled, error } = await world.client
    .from("document_processing_runs")
    .select("id")
    .not("ai_call_telemetry_id", "is", null)
    .or("provider_reported_cost_usd.not.is.null,calculated_cost_usd.not.is.null,incurred_cost_usd.not.is.null");
  if (error) throw new Error(`no-double-count probe failed: ${error.message}`);
  assertEquals(doubled?.length ?? 0, 0, "A referenced-AI document row carried its own cost: Claude OCR double-counted.");
});

Deno.test("costing-remote: environment, exclusion, and legacy epoch are filtered out of complete reports", async () => {
  if (skipRemote("filter separation")) return;
  const world = await seedWorld();

  // The development run exists...
  const { data: devRun } = await world.client
    .from("feature_runs")
    .select("environment")
    .eq("id", world.developmentRun)
    .single();
  assertEquals(devRun?.environment, "development");

  // ...but contributes to no complete monthly output.
  const featureRows = await viewRows(world.client, "costing_monthly_feature_usage", REPORT_MONTH);
  assertEquals(
    featureRows.some((row) => row.feature === "resume_analysis" && num(row.started_runs) > 3),
    false,
  );
  assertEquals(
    sumOf(featureRows, "started_runs"),
    world.completedIncludedRuns.length + world.failedIncludedRuns.length + world.canceledIncludedRuns.length,
    "Development and excluded runs must not be counted.",
  );

  // The legacy AI-only row appears ONLY in the explicitly partial view, carrying its label.
  const { data: legacy, error } = await world.client
    .from("costing_monthly_ai_legacy_partial")
    .select("*")
    .eq("month", monthKey(REPORT_MONTH));
  if (error) throw new Error(`legacy view query failed: ${error.message}`);
  assert((legacy?.length ?? 0) > 0, "The legacy pre-04.2 row must remain queryable as partial history.");
  assertEquals(legacy?.every((row) => row.completeness === "partial_ai_only_pre_04_2"), true);
  assertEquals(
    legacy?.some((row) => num(row.input_tokens) >= 7_777_777),
    true,
    "The legacy fixture's tokens must be visible in the partial view...",
  );
  const aiRows = await viewRows(world.client, "costing_monthly_ai_usage", REPORT_MONTH);
  assert(
    sumOf(aiRows, "input_tokens") < 7_777_777,
    "...and must NEVER reach the complete AI totals (D-08).",
  );
});

Deno.test("costing-remote: historical tier and exclusion snapshots survive a later account change", async () => {
  if (skipRemote("historical snapshots")) return;
  const world = await seedWorld();

  // The free-tier run was recorded at tier `free`. Reclassify the SAME subject as an
  // internal account TODAY -- the equivalent of a tier upgrade or an operator exclusion.
  const { data: freeRunBefore } = await world.client
    .from("feature_runs")
    .select("costing_subject_id, tier_at_time, exclude_from_costing_at_time")
    .eq("id", world.freeRun)
    .single();
  assertEquals(freeRunBefore?.tier_at_time, "free");

  const { error: classifyError } = await world.client
    .from("costing_account_classifications")
    .upsert(
      {
        costing_subject_id: freeRunBefore!.costing_subject_id,
        exclude_from_costing: true,
        classification_reason: "operator_override",
        classified_by: "operator",
      },
      { onConflict: "costing_subject_id" },
    );
  if (classifyError) throw new Error(`classification upsert failed: ${classifyError.message}`);

  // The historical run is UNCHANGED: reports read the snapshot, never the current row.
  const { data: freeRunAfter } = await world.client
    .from("feature_runs")
    .select("tier_at_time, exclude_from_costing_at_time")
    .eq("id", world.freeRun)
    .single();
  assertEquals(freeRunAfter?.tier_at_time, "free");
  assertEquals(freeRunAfter?.exclude_from_costing_at_time, false);

  const rows = await viewRows(world.client, "costing_monthly_feature_usage", REPORT_MONTH);
  assertEquals(
    sumOf(rows, "started_runs"),
    world.completedIncludedRuns.length + world.failedIncludedRuns.length + world.canceledIncludedRuns.length,
    "A present-day reclassification must not rewrite history.",
  );
});

Deno.test("costing-remote: one deliberate action cannot produce two feature runs", async () => {
  if (skipRemote("duplicate action")) return;
  const world = await seedWorld();
  const subject = await newSubject(world.client);
  world.subjects.push(subject);

  const first = await seedRun(world.client, {
    subject,
    feature: "resume_analysis",
    tier: "free",
    period: null,
    environment: "test",
    actionKey: world.duplicateActionKey,
    charged: 1,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 11),
  });
  world.runIds.push(first);

  // The SAME server action key. The partial unique index must reject the second row.
  const { error } = await world.client.from("feature_runs").insert({
    request_id: RUN_TAG,
    server_action_key_hash: world.duplicateActionKey,
    costing_subject_id: subject,
    feature: "resume_analysis",
    run_variant: "standard",
    status: "completed",
    tier_at_time: "free",
    input_type: "text",
    environment: "test",
    costing_epoch: COMPLETE_EPOCH,
    started_at: at(REPORT_MONTH, 11),
    completed_at: at(REPORT_MONTH, 11),
  });
  assertExists(error, "A duplicate server action key must be rejected by the live unique index.");
  assert(
    /duplicate key|unique/i.test(error!.message),
    `Expected a uniqueness violation, got: ${error!.message}`,
  );
});

Deno.test("costing-remote: provider pricing is append-only and historical rows are immutable", async () => {
  if (skipRemote("pricing immutability")) return;
  const client = await freshClient();

  const { data: existing, error: readError } = await client
    .from("provider_pricing")
    .select("id, provider, exact_sku, input_per_million_usd")
    .eq("provider", "anthropic")
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(`provider_pricing read failed: ${readError.message}`);
  assertExists(existing, "The reviewed Anthropic price seed must be live on preview.");

  const { error: updateError } = await client
    .from("provider_pricing")
    .update({ input_per_million_usd: 99 })
    .eq("id", existing!.id);
  assertExists(updateError, "provider_pricing must reject UPDATE: a price change is a NEW effective row.");

  const { error: deleteError } = await client
    .from("provider_pricing")
    .delete()
    .eq("id", existing!.id);
  assertExists(deleteError, "provider_pricing must reject DELETE: historical prices are never removed.");

  const { data: after } = await client
    .from("provider_pricing")
    .select("input_per_million_usd")
    .eq("id", existing!.id)
    .single();
  assertEquals(Number(after?.input_per_million_usd), Number(existing!.input_per_million_usd));
});

Deno.test("costing-remote: anon and authenticated clients cannot read or write costing telemetry", async () => {
  if (skipRemote("RLS deny")) return;
  const { url } = requireRemoteConfig();
  const anonKey = optionalEnv("SUPABASE_ANON_KEY_STAGING") ||
    optionalEnv("SUPABASE_TEST_ANON_KEY") ||
    optionalEnv("STAGING_SUPABASE_ANON_KEY");
  assert(
    anonKey.length > 0,
    "RLS DENY PROOF UNAVAILABLE: set SUPABASE_ANON_KEY_STAGING. This assertion must never be " +
      "skipped silently -- an unproven deny is the same as no deny.",
  );

  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

  for (
    const table of [
      "feature_runs",
      "document_processing_runs",
      "ai_call_telemetry",
      "costing_subjects",
      "costing_account_classifications",
      "provider_pricing",
      "costing_monthly_aggregates",
    ]
  ) {
    const { data, error } = await anon.from(table).select("*").limit(1);
    assert(
      error !== null || (data ?? []).length === 0,
      `RLS/grant FAILURE: an anon client read rows from public.${table}.`,
    );
  }

  // Writes must be impossible too -- a client that could insert could fabricate token
  // counts and AI costs (BRIEF s17).
  const { error: writeError } = await anon
    .from("ai_call_telemetry")
    .insert({
      feature: "resume_analysis",
      tier: "free",
      call_name: "anon_forgery",
      model: HAIKU,
      max_tokens: 1,
      ok: true,
      duration_ms: 1,
      input_tokens: 1,
      output_tokens: 1,
    });
  assertExists(writeError, "An anon client must never be able to insert AI telemetry.");
});

Deno.test("costing-remote: account deletion severs the Auth UUID and preserves the costing subject", async () => {
  if (skipRemote("deletion detachment")) return;
  const { url, key } = requireRemoteConfig();
  const client = await freshClient();

  const email = `costing-deletion+${crypto.randomUUID()}@strivo.test`;
  const created = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ email, password: `Fx!${crypto.randomUUID()}`, email_confirm: true }),
    signal: AbortSignal.timeout(20_000),
  });
  assert(created.ok, `Could not create the deletion fixture user (HTTP ${created.status}).`);
  const userId = (await created.json()).id as string;

  const subjectRow = must<{ id: string }>(
    "deletion subject",
    await client.from("costing_subjects").insert({ auth_user_id: userId }).select("id").single(),
  );

  const runId = await seedRun(client, {
    subject: subjectRow.id,
    feature: "resume_analysis",
    tier: "free",
    period: null,
    environment: "test",
    userId,
    charged: 1,
    refunded: 0,
    startedAt: at(REPORT_MONTH, 12),
  });

  const removed = await fetch(`${url.replace(/\/$/, "")}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  await removed.body?.cancel();
  assert(removed.ok, `Auth deletion failed (HTTP ${removed.status}).`);

  // D-17. The direct identity is GONE; the irreversible costing subject SURVIVES so
  // historical distinct-user MAU and cost totals stay accurate.
  const { data: subjectAfter } = await client
    .from("costing_subjects")
    .select("id, auth_user_id, detached_at")
    .eq("id", subjectRow.id)
    .single();
  assertEquals(subjectAfter?.id, subjectRow.id, "The costing subject must survive the deletion.");
  assertEquals(subjectAfter?.auth_user_id, null, "The Auth UUID must be severed immediately.");
  assertExists(subjectAfter?.detached_at);

  const { data: runAfter } = await client
    .from("feature_runs")
    .select("user_id, costing_subject_id, tier_at_time")
    .eq("id", runId)
    .single();
  assertEquals(runAfter?.user_id, null, "No deleted Auth UUID may survive on a costing row.");
  assertEquals(runAfter?.costing_subject_id, subjectRow.id);
  assertEquals(runAfter?.tier_at_time, "free", "Historical snapshots survive the deletion intact.");

  await client.from("feature_runs").delete().eq("id", runId);
  await client.from("costing_subjects").delete().eq("id", subjectRow.id);
});

Deno.test("costing-remote: retention aggregates before it prunes, and re-running is idempotent", async () => {
  if (skipRemote("retention boundary")) return;
  const client = await freshClient();

  // A cohort of five subjects, so the small-cohort suppression threshold (<5) is NOT hit and
  // the aggregate carries a real count rather than a suppressed NULL.
  const subjects: string[] = [];
  const runIds: string[] = [];
  for (let index = 0; index < 5; index += 1) {
    const subjectId = await newSubject(client);
    subjects.push(subjectId);
    runIds.push(
      await seedRun(client, {
        subject: subjectId,
        feature: "recruiting_lens",
        tier: "pro",
        period: "monthly",
        charged: 1,
        refunded: 0,
        // 26 months back: BEYOND the 24-month raw boundary, so this month must be rolled up
        // and then pruned.
        startedAt: at(RETENTION_MONTH, 1),
      }),
    );
  }

  const first = await client.rpc("rollup_and_prune_costing_telemetry");
  if (first.error) throw new Error(`retention rpc failed: ${first.error.message}`);

  // AGGREGATE BEFORE DELETE: the month survives as a privacy-safe aggregate...
  const { data: aggregate, error: aggError } = await client
    .from("costing_monthly_aggregates")
    .select("active_subjects, subject_count_suppressed, started_runs, completed_runs, merits_charged")
    .eq("month", monthKey(RETENTION_MONTH))
    .eq("metric_scope", "feature_usage")
    .eq("feature", "recruiting_lens")
    .eq("tier_at_time", "pro")
    .maybeSingle();
  if (aggError) throw new Error(`aggregate query failed: ${aggError.message}`);
  assertExists(aggregate, "The pruned month must survive as a monthly aggregate (D-16).");
  assertEquals(aggregate!.subject_count_suppressed, false, "A five-subject cohort is above the suppression floor.");
  assert(num(aggregate!.active_subjects) >= 5);
  assert(num(aggregate!.started_runs) >= 5);

  // ...while the identifiable RAW rows are gone.
  const { count: rawRemaining, error: rawError } = await client
    .from("feature_runs")
    .select("id", { count: "exact", head: true })
    .in("id", runIds);
  if (rawError) throw new Error(`raw survivor probe failed: ${rawError.message}`);
  assertEquals(rawRemaining ?? 0, 0, "Raw rows older than 24 months must be pruned after rollup.");

  // Every raw row in the table now sits inside the 24-month window.
  const { data: oldest } = await client
    .from("feature_runs")
    .select("started_at")
    .order("started_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (oldest?.started_at) {
    const boundary = startOfMonth(-24);
    assert(
      new Date(oldest.started_at as string) >= boundary,
      `A raw feature run survived beyond the 24-month boundary: ${oldest.started_at}`,
    );
  }

  // No aggregate older than five years survives.
  const { data: oldestAggregate } = await client
    .from("costing_monthly_aggregates")
    .select("month")
    .order("month", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (oldestAggregate?.month) {
    const fiveYears = startOfMonth(-60);
    assert(
      new Date(`${oldestAggregate.month as string}T00:00:00Z`) >= fiveYears,
      `An aggregate survived beyond the five-year boundary: ${oldestAggregate.month}`,
    );
  }

  // IDEMPOTENT: a second run at the same boundary changes nothing and deletes nothing.
  const second = await client.rpc("rollup_and_prune_costing_telemetry");
  if (second.error) throw new Error(`second retention rpc failed: ${second.error.message}`);
  const report = second.data as Record<string, number>;
  assertEquals(Number(report.feature_runs_deleted), 0, "A repeat prune must be a no-op.");
  assertEquals(Number(report.ai_attempts_deleted), 0);
  assertEquals(Number(report.documents_deleted), 0);

  const { data: aggregateAgain } = await client
    .from("costing_monthly_aggregates")
    .select("active_subjects, started_runs")
    .eq("month", monthKey(RETENTION_MONTH))
    .eq("metric_scope", "feature_usage")
    .eq("feature", "recruiting_lens")
    .eq("tier_at_time", "pro")
    .maybeSingle();
  assertEquals(num(aggregateAgain?.active_subjects), num(aggregate!.active_subjects));
  assertEquals(num(aggregateAgain?.started_runs), num(aggregate!.started_runs));

  for (const subjectId of subjects) {
    await client.from("costing_subjects").delete().eq("id", subjectId);
  }
});

Deno.test("costing-remote: reconciliation finds no orphaned, non-terminal, or double-counted fixture rows", async () => {
  if (skipRemote("reconciliation")) return;
  const world = await seedWorld();

  // No complete-epoch attempt in the fixture month is orphaned.
  const { data: orphans, error } = await world.client
    .from("ai_call_telemetry")
    .select("id")
    .eq("costing_epoch", COMPLETE_EPOCH)
    .eq("req_id", RUN_TAG)
    .is("feature_run_id", null);
  if (error) throw new Error(`orphan probe failed: ${error.message}`);
  assertEquals(orphans?.length ?? 0, 0, "A complete-epoch attempt must always carry its feature run.");

  // No fixture run is stuck in `started`.
  const { data: nonTerminal } = await world.client
    .from("feature_runs")
    .select("id")
    .eq("request_id", RUN_TAG)
    .eq("status", "started");
  assertEquals(nonTerminal?.length ?? 0, 0, "A finished request must never stay marked `started`.");

  // Combined known spend = AI + document, and the two are disjoint.
  const aiRows = await viewRows(world.client, "costing_monthly_ai_usage", REPORT_MONTH);
  const docRows = await viewRows(world.client, "costing_monthly_document_usage", REPORT_MONTH);
  const combined = sumOf(aiRows, "known_incurred_cost_usd") + sumOf(docRows, "known_incurred_cost_usd");
  assertAlmostEquals(
    combined,
    world.expectedAi.knownCostUsd + world.expectedDocuments.knownCostUsd,
    1e-9,
    "Total known provider spend for the fixture month: A3 + A4, disjoint by construction.",
  );
});

// ── Teardown ────────────────────────────────────────────────────────────────────────────
// Registered LAST so it runs after every assertion above. Preview must not accumulate
// fixture rows across runs (an accumulated month would break the exclusivity precondition
// of the very next run).

Deno.test("costing-remote: fixture teardown leaves preview clean", async () => {
  if (skipRemote("teardown")) return;
  if (!seededPromise) return;
  const world = await seedWorld();

  await world.client.from("document_processing_runs").delete().eq("request_id", RUN_TAG);
  await world.client.from("ai_call_telemetry").delete().eq("req_id", RUN_TAG);
  await world.client.from("feature_runs").delete().eq("request_id", RUN_TAG);
  for (const subjectId of world.subjects) {
    await world.client.from("costing_account_classifications").delete().eq("costing_subject_id", subjectId);
    await world.client.from("costing_subjects").delete().eq("id", subjectId);
  }

  const { count: remaining, error } = await world.client
    .from("feature_runs")
    .select("id", { count: "exact", head: true })
    .eq("request_id", RUN_TAG);
  if (error) throw new Error(`teardown probe failed: ${error.message}`);
  assertEquals(remaining ?? 0, 0, "Fixture feature runs must not survive the lane.");
});
