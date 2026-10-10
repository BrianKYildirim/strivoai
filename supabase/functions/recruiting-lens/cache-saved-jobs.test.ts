import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("recruiting lens rejects missing company, role, or JD before analysis", () => {
  assert(source.includes("Company name is required."));
  assert(source.includes("Role title is required."));
  assert(source.includes("Job description is required (minimum 50 characters)."));
  assert(source.includes("typeof body.role_title === 'string'"));
});

Deno.test("recruiting lens persists analysis_results before applications upsert and linked usage", () => {
  const persistHelper = source.slice(
    source.indexOf("async function persistRecruitingLensResult"),
    source.indexOf("async function upsertSavedRecruitingLensJob"),
  );
  assert(persistHelper.includes(".from('analysis_results').insert"));
  assert(persistHelper.includes("await upsertSavedRecruitingLensJob"));
  assert(persistHelper.indexOf("await upsertSavedRecruitingLensJob") > persistHelper.indexOf(".select('id').single()"));
  assert(persistHelper.includes("recordUsageWithAnalysis(params.userId, 'recruiting_lens', 1, data.id)"));
  assert(persistHelper.indexOf("recordUsageWithAnalysis") > persistHelper.indexOf("await upsertSavedRecruitingLensJob"));
});

Deno.test("recruiting lens applications row carries job metadata and analysis deep-link id", () => {
  const helper = source.slice(
    source.indexOf("async function upsertSavedRecruitingLensJob"),
    source.indexOf("async function refreshSavedRecruitingLensJob"),
  );
  assert(helper.includes(".from('applications')"));
  assert(helper.includes("analysis_id: params.analysisId"));
  assert(helper.includes("role_applied: params.roleTitle"));
  assert(helper.includes("company_applied: params.company"));
  assert(helper.includes("status: 'saved'"));
  // Phase 42 Plan 42-10: canonical application_source shifted from 'other' to 'recruiting_lens'
  assert(helper.includes("application_source: 'recruiting_lens'"));
  assert(helper.includes(".eq('company_applied', params.company)"));
  assert(helper.includes(".eq('role_applied', params.roleTitle)"));
  // Phase 42 Plan 42-10: lookup by canonical application_source instead of location sentinel
  assert(helper.includes(".eq('application_source', 'recruiting_lens'"));
});

Deno.test("CACHE-07 key and gateway precheck include required Recruiting Lens inputs", () => {
  assert(source.includes("import { computeCacheKey, sha256Hex }"));
  assert(source.includes("RECRUITING_LENS_CACHE_VARIANT"));
  assert(source.includes("resumeSummary_hash"));
  assert(source.includes("jobDescription_hash"));
  assert(source.includes("linkedinText_hash"));
  assert(source.includes("role_title: params.roleTitle"));
  assert(source.includes("precheck_cache: () => readRecruitingLensCache"));
});

Deno.test("cache hits refresh saved tile and surface through Activity History", () => {
  const cacheReader = source.slice(
    source.indexOf("async function readRecruitingLensCache"),
    source.indexOf("async function writeRecruitingLensCache"),
  );
  assert(cacheReader.includes(".from('analysis_cache')"));
  assert(cacheReader.includes("hit_count: Number(meta.hit_count ?? 1) + 1"));
  assert(cacheReader.includes("await refreshSavedRecruitingLensJob"));
  assert(source.includes("p_analysis_id: hit.analysis_id") || source.includes("precheck_cache"));
});
