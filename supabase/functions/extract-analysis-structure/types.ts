/**
 * types.ts — shared types for the extract-analysis-structure worker.
 *
 * Why this file exists: index.ts and each extract-*.ts previously declared their OWN
 * identically-named copies of SupabaseClientLike / QueryBuilderLike / the analysis row.
 * Because the copies were structurally different, passing the client from index.ts into
 * an extractor produced TS2345 ("SupabaseClientLike is not assignable to
 * SupabaseClientLike"). One shared declaration removes that whole class of error.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { Database, Json } from "../_shared/database.types.ts";

/**
 * The client this worker receives — the REAL supabase-js client type, i.e. exactly what
 * getServiceClient() returns and what every call site actually passes.
 *
 * Why not a hand-rolled structural "…Like" mimic? That is what the per-file copies were,
 * and a chainable mimic can never be honest here: the old shape declared eq()/order()/
 * limit() directly on the value returned by from(), which PostgREST does not do (those
 * only exist after .select()/.update()). Fixing that shape is not enough either —
 * PostgREST's builders are self-recursive AND heavily generic, so assigning a real
 * SupabaseClient to ANY chainable mimic makes the compiler give up with TS2589 ("type
 * instantiation is excessively deep"). The only ways to keep a mimic would be an
 * `as unknown as` assertion or a suppression comment — asserting a relationship the
 * compiler cannot verify. Naming the real type instead keeps the production call sites
 * genuinely checked against the value that is genuinely passed.
 *
 * Update (260717-42m): the trade-off recorded here — "getServiceClient() is
 * un-parameterised, so supabase-js types query results as `any`" — no longer applies.
 * The generated Database generic IS now wired into getServiceClient(), and row access at
 * the DB boundary is genuinely checked. That is exactly what caught the three drifted
 * AnalysisResultRow fields documented below. The alias itself needed no change, as
 * predicted. Keep narrowing raw jsonb values through asRecord/asString/asNumber: `Json`
 * is checked, but it is still a union.
 */
export type SupabaseClientLike = SupabaseClient<Database>;

/** The feature discriminator stored on analysis_results.analysis_type. */
export type ExtractFeature = "resume_analysis" | "linkedin_grading" | "recruiting_lens";

/**
 * The analysis_results row this worker reads — derived from the generated schema
 * rather than hand-written, so it cannot drift from the DB again.
 *
 * What the hand-written version got wrong (all three surfaced the moment the
 * Database generic was wired into getServiceClient()):
 *   - `analysis_type?: ExtractFeature` — the column is plain `text`, NOT a
 *     constrained enum. Declaring the narrow union asserted a guarantee the DB
 *     does not make. Callers switch on it with a `default` branch, so the real
 *     `string` is handled correctly; the union was simply untrue.
 *   - `raw_response: Record<string, unknown> | null` — the column is `jsonb`, so
 *     its value may be an array or a scalar, not only an object. Extractors
 *     already narrow via asRecord(), which is why this was never hit at runtime.
 *   - `created_at?: string | null` — the column is NOT NULL.
 */
export type AnalysisResultRow = Pick<
  Database["public"]["Tables"]["analysis_results"]["Row"],
  "id" | "user_id" | "analysis_type" | "primary_score" | "raw_response" | "source_reference" | "created_at"
>;

/**
 * Normalize a value through the same JSON serialization boundary used by
 * PostgREST before assigning it to a generated `jsonb` column type.
 */
export function normalizeJson(value: unknown): Json {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : JSON.parse(serialized);
}

/** Structural logger contract (satisfied by createLogger's return value). */
export type Log = {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
};
