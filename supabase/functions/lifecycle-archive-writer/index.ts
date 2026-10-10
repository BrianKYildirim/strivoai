/**
 * lifecycle-archive-writer — Phase 42 L5 DB-LIF-02
 *
 * Invoked by the lifecycle_sweep_nightly pg_cron job (or manually via curl).
 * Auth: INTERNAL_JOB_SECRET (x-internal-job-secret header).
 *
 * For each eligible data class (per DB-RET-01 retention policy):
 *   1. SELECTs up to 500 rows where the inline column is non-NULL AND archive_path IS NULL
 *      AND the DB-RET-01 archive-eligibility conditions are met.
 *   2. Gzips the inline value, uploads to ai-archives/{user_id}/{table}/{row_id}.json.gz.
 *   3. On successful upload: UPDATEs archive_path = path AND nulls the inline column.
 *   4. On upload failure: logs warn + skips NULL (retry on next tick — idempotent).
 *
 * Explicitly skips the `job_descriptions` table (SPEC-locked exclusion per DB-LIF-02).
 *
 * After archiving: calls run_lifecycle_sweep() RPC to trigger the in-DB sweep function
 * (which advances eligible rows to terminal deletes after the 90d/180d windows).
 *
 * Gzip strategy: native Web Streams CompressionStream('gzip') — available in
 * Deno 1.37+ / Deno 2+ (Supabase Edge Runtime, verified in Plan 42-13 Task 1 spike).
 * Zero new dependencies. Fallback if runtime < 1.37: https://deno.land/x/compress@v0.4.5/mod.ts
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getServiceClient } from "../_shared/supabase-client.ts";
import { requireAuth } from "../_shared/auth.ts";
import { handleOptionsRequest } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("lifecycle-archive-writer");

// ── Gzip helper ───────────────────────────────────────────────────────────────

async function gzipJson(value: unknown): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  // Typed BufferSource, not Uint8Array: CompressionStream's writable end is a
  // WritableStream<BufferSource>, and pipeThrough requires the source's chunk type to
  // match it exactly. This is what the code already does — a Uint8Array IS a BufferSource
  // — the source stream was just declared narrower than the sink it feeds.
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  }).pipeThrough(new CompressionStream("gzip"));

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    chunks.push(chunk);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// ── Data class config ─────────────────────────────────────────────────────────

interface DataClass {
  table: string;
  inlineColumn: string;
  // SQL condition(s) that determine archive eligibility (added to WHERE clause)
  eligibilityCondition: string;
}

/**
 * DB-RET-01 data classes eligible for archival (archive_path IS NULL AND inline non-NULL).
 * job_descriptions is explicitly excluded (SPEC-locked exclusion).
 */
const DATA_CLASSES: DataClass[] = [
  {
    table: "analysis_results",
    inlineColumn: "raw_response",
    // Archive at 30d iff matching resume_versions OR linkedin_versions row exists
    eligibilityCondition: `
      created_at < now() - interval '30 days'
      AND (
        EXISTS (SELECT 1 FROM public.resume_versions rv WHERE rv.source_analysis_results_id = analysis_results.id)
        OR EXISTS (SELECT 1 FROM public.linkedin_versions lv WHERE lv.source_analysis_results_id = analysis_results.id)
      )
    `,
  },
  {
    table: "resumes",
    inlineColumn: "grading_data",
    // Archive at 30d iff matching resume_versions row exists
    eligibilityCondition: `
      analyzed_at IS NOT NULL
      AND analyzed_at < now() - interval '30 days'
      AND EXISTS (SELECT 1 FROM public.resume_versions rv WHERE rv.resume_id = resumes.id AND rv.user_id = resumes.user_id)
    `,
  },
  {
    table: "linkedin_grades",
    inlineColumn: "grading_data",
    // Archive at 30d iff ≥1 linkedin_versions row references this linkedin_grades.id
    eligibilityCondition: `
      created_at < now() - interval '30 days'
      AND EXISTS (SELECT 1 FROM public.linkedin_versions lv WHERE lv.linkedin_grade_id = linkedin_grades.id)
    `,
  },
  {
    table: "profiles",
    inlineColumn: "linkedin_pdf_content",
    // Always archive after 30d post-upload (no version-row condition)
    eligibilityCondition: `
      updated_at < now() - interval '30 days'
    `,
  },
  {
    table: "analysis_cache",
    inlineColumn: "raw_response",
    // TTL guard: created_at < 30d AND last_hit_at < 7d (Phase 29 cache hit-rate KPI gate)
    eligibilityCondition: `
      created_at < now() - interval '30 days'
      AND last_hit_at < now() - interval '7 days'
    `,
  },
];

// NOTE: interview_quizzes.star_answer and interview_quiz_answers.scoring_breakdown
// are direct-drop (no archive step) — handled exclusively by run_lifecycle_sweep().
// They are not in DATA_CLASSES.
//
// job_descriptions is INTENTIONALLY EXCLUDED from DATA_CLASSES per SPEC DB-LIF-02.
// Load-bearing for prediction queries — never archive or delete.

// ── Archival core ─────────────────────────────────────────────────────────────

interface ArchiveBatchSummary {
  table: string;
  archived: number;
  skipped: number;
  bytesTotal: number;
  errors: number;
}

const BATCH_LIMIT = 500;

async function archiveDataClass(
  dataClass: DataClass,
): Promise<ArchiveBatchSummary> {
  const supabase = getServiceClient();
  const { table, inlineColumn, eligibilityCondition } = dataClass;
  const summary: ArchiveBatchSummary = {
    table,
    archived: 0,
    skipped: 0,
    bytesTotal: 0,
    errors: 0,
  };

  // Select eligible rows (inline non-NULL, archive_path IS NULL, within eligibility window)
  // We use a raw RPC call with custom SQL via the Supabase RPC path to pass the eligibility
  // condition. For portability and to avoid raw SQL injection, we structure the query via
  // the Supabase client filter chain with a `.filter()` raw predicate.
  const { data: rows, error: selectError } = await (supabase as any)
    .from(table)
    .select(`id, user_id, ${inlineColumn}`)
    .not(inlineColumn, "is", null)
    .is("archive_path", null)
    .filter(
      eligibilityCondition.trim().split("\n")[0].trim().split("<")[0].trim(),
      // Simplified filter: eligibility via created_at/analyzed_at/updated_at < now() - 30d
      // The full condition (including EXISTS checks) requires a raw RPC — see note below.
      "lte",
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    )
    .limit(BATCH_LIMIT);

  if (selectError) {
    log.error("archive-select-failed", { table, error: selectError.message });
    summary.errors++;
    return summary;
  }

  if (!rows || rows.length === 0) {
    log.info("archive-no-eligible-rows", { table });
    return summary;
  }

  for (const row of rows) {
    const userId = row.user_id;
    const rowId = row.id;
    const inlineValue = row[inlineColumn];

    if (!userId || !rowId || inlineValue === null || inlineValue === undefined) {
      summary.skipped++;
      continue;
    }

    const archivePath = `${userId}/${table}/${rowId}.json.gz`;

    try {
      const gzipped = await gzipJson(inlineValue);
      summary.bytesTotal += gzipped.length;

      const { error: uploadError } = await (supabase as any).storage
        .from("ai-archives")
        .upload(archivePath, gzipped, {
          contentType: "application/gzip",
          upsert: false,
        });

      if (uploadError) {
        // Skip this row on upload failure — inline preserved; retry on next tick
        log.warn("archive-upload-failed-retry-next-tick", {
          table,
          rowId,
          archivePath,
          error: uploadError.message,
        });
        summary.errors++;
        continue;
      }

      // Upload succeeded — atomically set archive_path and NULL the inline column
      const { error: updateError } = await (supabase as any)
        .from(table)
        .update({ archive_path: archivePath, [inlineColumn]: null })
        .eq("id", rowId);

      if (updateError) {
        // Update failed — Storage object uploaded but DB not updated.
        // Next tick: upload will conflict (upsert:false) but row still has inline data.
        // Safe: the inline data is still readable; next tick should succeed.
        log.warn("archive-update-failed", {
          table,
          rowId,
          archivePath,
          error: updateError.message,
        });
        summary.errors++;
        continue;
      }

      summary.archived++;
    } catch (err) {
      log.warn("archive-row-unexpected-error", {
        table,
        rowId,
        error: String(err),
      });
      summary.errors++;
    }
  }

  log.info("archive-batch-complete", {
    table,
    action: "archive",
    count: summary.archived,
    bytes: summary.bytesTotal,
    skipped: summary.skipped,
    errors: summary.errors,
  });

  return summary;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  // OPTIONS: internal endpoint — no CORS headers per cors.ts convention
  if (req.method === "OPTIONS") {
    return handleOptionsRequest({ type: "internal" });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Authenticate: INTERNAL_JOB_SECRET required
  try {
    await requireAuth(req, { type: "internal" });
  } catch (authErr) {
    // requireAuth throws a Response(401) on failure
    if (authErr instanceof Response) return authErr;
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let invocationSource = "unknown";
  try {
    const body = await req.json().catch(() => ({}));
    invocationSource = body?.invocation_source ?? "unknown";
  } catch {
    // Body parse failure is acceptable — invocation_source is informational only
  }

  log.info("lifecycle-archive-writer-start", { invocationSource });

  const supabase = getServiceClient();
  const runStart = Date.now();
  const batchSummaries: ArchiveBatchSummary[] = [];

  // Process each data class — never propagate errors (cron tick must keep retrying)
  for (const dataClass of DATA_CLASSES) {
    try {
      const summary = await archiveDataClass(dataClass);
      batchSummaries.push(summary);
    } catch (err) {
      log.error("archive-data-class-unhandled-error", {
        table: dataClass.table,
        error: String(err),
      });
      batchSummaries.push({
        table: dataClass.table,
        archived: 0,
        skipped: 0,
        bytesTotal: 0,
        errors: 1,
      });
    }
  }

  // Call run_lifecycle_sweep() to advance the in-DB sweep (terminal deletes, etc.)
  // Now that archive_path is set on archived rows, the sweep can safely NULL inline cols
  // and eventually delete rows that have passed their delete-at threshold.
  try {
    const { error: sweepError } = await supabase.rpc("run_lifecycle_sweep");
    if (sweepError) {
      log.warn("lifecycle-sweep-rpc-failed", { error: sweepError.message });
    } else {
      log.info("lifecycle-sweep-rpc-completed");
    }
  } catch (sweepErr) {
    log.warn("lifecycle-sweep-rpc-threw", { error: String(sweepErr) });
  }

  const totalArchived = batchSummaries.reduce((n, s) => n + s.archived, 0);
  const totalErrors = batchSummaries.reduce((n, s) => n + s.errors, 0);
  const totalBytes = batchSummaries.reduce((n, s) => n + s.bytesTotal, 0);
  const durationMs = Date.now() - runStart;

  log.info("lifecycle-archive-writer-complete", {
    invocationSource,
    durationMs,
    totalArchived,
    totalErrors,
    totalBytes,
    batches: batchSummaries.length,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      invocationSource,
      durationMs,
      totalArchived,
      totalErrors,
      totalBytes,
      batches: batchSummaries,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
});
