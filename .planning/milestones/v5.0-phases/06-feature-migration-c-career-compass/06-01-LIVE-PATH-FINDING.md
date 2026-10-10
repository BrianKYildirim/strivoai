# 06-01 Live-Path Finding — RESEARCH Open Question 1

**Question (RESEARCH §Open Questions, Q1):** Which `analyze-career` branch (legacy `:1323+` vs merit `:854+`) and which tier does the LIVE internal-worker queue path actually execute?

**Status:** RESOLVED (static call-graph, HIGH confidence) — awaiting operator approval of the Task-3 attachment decision.
**Evidence basis:** STATIC-ONLY. Live-row inspection via the Supabase MCP (preview `cimjltzovkahkqecpwgi` / read-only prod `zjpjapgraoxdukdvpjes`) was not reachable from this executor's tool surface. Per the plan's Task-1 allowance ("if neither has career rows, the static call-graph read stands as the finding"), the static call-graph read is the recorded finding. An optional live-row confirmation is offered to the operator below (does not change the conclusion).

---

## Confirmed live branch + tier

**The live main career path executes the LEGACY branch (`analyze-career/index.ts:1323+`) at `resolvedTier = 'free'`.** This confirms primary hypothesis **H2**; H1 (merit-branch live on the queue path) is NOT the internal-worker path.

### Call-graph chain (each link cited)

1. **Frontend main submit → queue, not direct.** `src/pages/CareerCompass.tsx` routes the main Career Compass submit through `submit-career-analysis-job`; `invokeCareerAnalysisDirectWithFailover` (direct user-auth POST) is used ONLY for multi-role compare (D-06). The direct merit-branch is therefore reachable only for multi-role, which stays outside the executor.

2. **`submit-career-analysis-job:96-127`** deducts Merits HERE via `withMerits({ userId, tier, corsType:'user' }, 'career_compass', …)` (`:96-98`) and inserts an `analysis_jobs` row (`job_type:'career_compass_analysis'`) whose `payload` (`innerPayload`) carries `tier` (`:106`, defaults `"free"`) and `merit_transaction_id: txId` (`:126`). Merit deduction is a SUBMIT-side concern — it does not recur in analyze-career on the internal path.

3. **`process-career-analysis-job:130-138`** (worker) fetches `TARGET_FUNCTION = analyze-career` with header **`x-internal-job-secret: internalJobSecret`** (`:136`) and `body: JSON.stringify(payload)` (`:138`) — the job payload verbatim.

4. **`analyze-career:818`** calls `requireInternalOrUserAuth(req)`. In **`auth.ts:189-191`**, because the request `hasInternalSecret`, it routes to **`requireInternalAuth`**, which returns **`null`** on success (`auth.ts:141,172`). So **`userContext === null`** on the worker path.

5. **`analyze-career:819`** → `effectiveUserId = userContext?.userId ?? payload.userId` (falls back to the payload userId — worker still has a user identity).

6. **`analyze-career:831-834`** → `resolvedTier` derives ONLY from `userContext?.tier`. With `userContext` null, `resolvedTier = 'free'`. **`body.tier` is never destructured** — the `:815` destructure list (`linkedinUrl, resumeFilePath, resumeTextContent, userId, linkedinPdfContent, resumeOcrImages, compareRoles, existingAnalysis, allowResumeOnly`) has **no `tier`**. The `payload.tier` from submit is silently ignored.

7. **`analyze-career:854`** merit-branch gate is `if (MERIT_SYSTEM_ENABLED && userContext)`. With `userContext` null this is **FALSE** regardless of the `MERIT_SYSTEM_ENABLED` env value → the merit-branch (prior-analyses 412 gates `:909-946`, Pro/Elite fan-out, elite-extras) is **skipped**.

8. Control falls to the **legacy path `:1323+`** ("=== Legacy path (unchanged — MIG-05) ==="). `authenticatedUserId = userContext?.userId ?? userId` (`:1324`). Non-multi-role → `checkEntitlement` (`:1336`) + the 3-field input validation (`:1344-1370`, resumeFilePath + LinkedIn PDF content + linkedinUrl `linkedin.com/in/`), single-shot AI, assemble, persist, respond.

### Two-gate note (does not change conclusion)
The merit-branch has TWO gates: `MERIT_SYSTEM_ENABLED` (module-scope env read, `merit-gateway.ts:27-28`, exact-lowercase `'true'`) AND a non-null `userContext`. `MERIT_SYSTEM_ENABLED`'s live value is env-driven and not statically determinable from the repo, BUT it is irrelevant to the internal-worker path: the `userContext` half of the AND is already false there. The merit-branch is reachable ONLY by a DIRECT user-auth POST (multi-role compare) AND only when `MERIT_SYSTEM_ENABLED` is on.

---

## Task-3 ATTACHMENT DECISION

**Attach `runAnalysisLifecycle('career_compass')` around the LEGACY branch (`analyze-career/index.ts:1323+`), the non-multi-role single-shot main path, at `resolvedTier` (live: `'free'`).** Do NOT attach around the merit-branch `:854+` and do NOT route `handleMultiRoleComparison` through the executor (D-06 — multi-role stays verbatim).

### Byte-preserve baseline object
The object to preserve byte-identically (the assembled FINAL saved+returned payload of the legacy branch) is **`analysisResult`** as it exists at the legacy tail:
- Built at `:1773` (`JSON.parse(jsonContent)` of the model output), then augmented:
  - `:1806-1807` `detectedDomain` + `domainEvidence` (from `domainClassification`)
  - `:1810` `delete analysisResult.jobs`
  - `:1813` `applyCareerTierShape(analysisResult, resolvedTier)`
  - `:1814` `applyCareerCompassFreeOutputPolicy(analysisResult, resolvedTier)`
  - `:1815` `assertPaidCareerOutputComplete(analysisResult, resolvedTier)` (the non-empty-core invariants `careerSemanticCheck` must mirror byte-identically)
  - `:1831-1832` `reusedLinkedinGrade = false`, `linkedinGradeDate = null` (legacy metadata)
- **Persisted** via `persistCareerResultAndRecordUsage(supabase, { analysisResult, … })` at `:1820`.
- **Returned** as `new Response(JSON.stringify(analysisResult), …)` at `:1836-1837`.

Task 3's `generate()` returns this assembled `analysisResult` serialized as text; `save(value)` reconciles onto `persistCareerResultAndRecordUsage` with `analysis_results.insert` as the SOLE authoritative throws-pre-settle write (profiles/analysis_cache/usage/email demoted to log-and-continue). On `dormant:true`, fall through to this UNCHANGED legacy tail (byte-identical while `ANALYSIS_LIFECYCLE_CAREER_COMPASS` is OFF).

### Idempotency-key gap (D-03) — separate closure in Task 3
The DIRECT-path merit ctx at **`analyze-career:1000-1002`** (`{ userId, tier, corsType }`, NO key) is confirmed to lack `idempotencyKey`. Task 3 sets `meritCtx.idempotencyKey` to the derived key here (mirrors the `analyze-resume:728` fix), independent of which branch is live for the queue path.

---

## SEPARATE finding — tier-resolution limitation (OUT OF SCOPE for FEAT-05)

The internal-worker path executes at **`free`** tier regardless of the submitter's actual subscription tier, because (a) `body.tier`/`payload.tier` is never destructured (`:815`) and (b) internal auth yields `userContext = null` so no server-side tier is resolved. A Pro/Elite user's queued Career Compass run is thus processed with free-tier model/shape selection (`getModel('free','career')`, `applyCareerTierShape(…, 'free')`).

This is recorded as a **SEPARATE finding, NOT scheduled as a fix in this phase.** FEAT-05 foregrounds Free-tier correctness and byte-preservation; silently "fixing" tier resolution inside this migration would change behavior and is out of scope. Flagged for a future phase / operator decision (candidate: RESIDUAL-REGISTER).

---

## Optional live-row confirmation (operator, does not gate the finding)

If the operator wishes to corroborate the static read against live data (not required — static basis stands):
- Preview `cimjltzovkahkqecpwgi`: `select id, status, payload->>'tier' as payload_tier, (payload ? 'linkedinPdfContent') as has_li, created_at from analysis_jobs where job_type='career_compass_analysis' order by created_at desc limit 20;` then the matching `select analysis_type, tier, created_at from analysis_results where analysis_type='career_compass' order by created_at desc limit 20;`
- analyze-career function logs: look for `request-start` entries — the logged `tier` field (`:839`) on internal-worker invocations should read `free`; direct (multi-role) calls carry the JWT tier.
- Note (STATE/MEMORY): true prod `zjpjapgraoxdukdvpjes` is near-empty (1 user) — preview is the primary evidence source if used.

---

## Acceptance-criteria coverage

- [x] States, with evidence, which branch (legacy `:1323+`) and tier (`free`) the internal-worker fetch executes — via cited static call graph.
- [x] Records the explicit Task-3 ATTACHMENT DECISION (wrap legacy branch) + names the byte-preserve baseline object (`analysisResult`, `:1773-1837`, persisted `:1820`, returned `:1836`).
- [x] Static-only basis stated explicitly; the requireInternalAuth→null→merit-branch-skipped→legacy-free-tier reasoning recorded.
- [x] Tier-resolution limitation logged as a SEPARATE finding, not scheduled here.
- [x] No writes/migrations/flag-flips performed (read-only).
- [ ] **Operator approval of the attachment decision — PENDING (this checkpoint).**
