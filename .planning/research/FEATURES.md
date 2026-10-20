# Feature Research

**Domain:** Career-intelligence dashboard sections + LinkedIn grading rubric + reliable AI-analysis run UX (Strivo AI, v5.0)
**Researched:** 2026-06-25
**Confidence:** MEDIUM-HIGH (recruiter/consistency behavior validated by market sources; rubric + run-UX validated against existing codebase and industry patterns; the specific Free/Elite depth boundaries come from the v5.0 milestone spec, not external research)

---

## Scope & Grounding

This research covers ONLY the four new/changed v5.0 surfaces. Everything else (the five AI analyses, Career OS hero, readiness cards, Next 3 Moves, Readiness Matrix, Every Version Ranked, Saved Jobs, Career Launch Path, navbar/sidebar/Merits, History page) is PROTECTED and out of scope.

**The two replacements (`src/pages/Dashboard.tsx`):**

| v4.0 (current, being replaced) | v5.0 (new) | Existing component |
|---|---|---|
| "Live Career Profile" (Profile Intelligence) | **Recruiter First Impression** | `ProfileIntelligence` (lines 849-894) |
| "Activity Stream" (Career Timeline) | **Profile Alignment** | `CareerTimeline` (lines 1190-1239) |
| "Progress and Achievements" | *(deleted)* | `ProgressAndAchievements` (lines 1174-1188) |

**Critical grounding observation — the current sections already violate the v5.0 constraint.** The existing `ProfileIntelligence` (lines 326-352) fabricates personalized-looking insight:
- It hard-codes fallback strings rendered as if they were findings: `'Upload or analyze a resume to map your strongest career signals.'`, `'Run one analysis to surface the highest-leverage fixes.'`
- It computes synthetic scores with arbitrary coefficients (`jobReadiness = clampScore(52 + latestResumeScore * 0.32 + ...)`, `careerReadiness`, `getJobMatchScore`, `radarItems` like `latestResumeScore - 4 + savedJobs.length * 2`).
- It blends fields opportunistically (`pickStrings(resumeData, ['strengths','keyStrengths','whatYouHave'])`).

The v5.0 sections must NOT do this. Every standout, concern, alignment finding, and action must be traceable to a stored field from a real analysis. When data is missing, show an honest empty state — never a placeholder dressed as an insight.

**Stored data the new sections derive from (NO new AI calls on dashboard load):**
- `analysis_results` — `analysis_type`, `primary_score`, `raw_response` (full feature output), `key_insights`, `source_reference`, `created_at`
- `linkedin_grades` — `overall_score`, `grading_data` (full v3 grade), `profile_url`
- `resumes` — `overall_score`, `grading_data`, `file_name`
- `resume_versions` / `linkedin_versions` / `scores` / `recommendations` — structured rows produced by `extract-analysis-structure` (decomposes each analysis into queryable sub-scores + suggestions)
- Career Compass output (Career DNA, fields, gaps, surprise fits, roadmaps) and Recruiting Lens results (saved to `applications`)

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Recruiter First Impression renders a plain-language positioning summary | Users have run analyses; the dashboard must reflect *their* profile, not generic copy | MEDIUM | Pull from stored resume `grading_data.summary` / Career Compass DNA / `analysis_results.raw_response`; never invent |
| Concrete, evidence-backed standouts and concerns | The whole value of "recruiter view" is specificity ("recruiters skim 6-8s and triage on signals") | MEDIUM | Each item must cite a stored signal (a quantified bullet, a missing section, a score) |
| Single fixed-set recruiter response state | Users need one clear verdict, not a vague vibe; mirrors real recruiter triage (shortlist / pass / unclear) | MEDIUM | Derive deterministically from stored scores + completeness; 5 fixed states, never free-text invented |
| Profile Alignment overall score + interpretation | "Do my resume and LinkedIn tell one story?" is a recognized job-seeker anxiety; recruiters triangulate across both | MEDIUM | Compute from comparing stored resume vs stored LinkedIn structured fields |
| Empty states when a profile is missing | You cannot compare one document against nothing; scoring a single profile as "alignment" is a lie | LOW | Resume-only and LinkedIn-only copy; MUST NOT emit a number |
| LinkedIn grade: per-section earned/max + evidence | Already shipped at 4 sections; users expect a transparent breakdown, not a black-box number | MEDIUM | Expand to 11 sections; keep evidence-quoting requirement |
| LinkedIn TOTAL = deterministic sum of weighted sections | A score the model invents drifts and clusters (~52/100 bug); users expect the parts to add up | LOW-MEDIUM | Already enforced for 4 sections (`validateLinkedInGrade`: `rawScore === sum`); generalize to weighted 11 |
| Run shows progress stages and finishes or fails cleanly | Long AI calls without feedback feel broken; users abandon | MEDIUM | `UniversalAnalyzing` already does asymptotic progress + step list + scroll-lock |
| Duplicate submit disabled while running | Double-charging Merits / double analysis is unacceptable | LOW | Button `disabled` + global `AnalysisLockContext` already exist; needs idempotency key server-side |
| Previous result preserved on failed re-run | Losing a good prior analysis because a retry failed is a trust-killer | MEDIUM | Don't overwrite stored result until a new one validates |
| Merit charged only for a saved, valid analysis | Charging for a failed/empty analysis is the #1 billing-trust violation | MEDIUM-HIGH | Reserve→settle/refund lifecycle; `withMerits` + `MeritRefundable` are the spine |
| History reflects what actually happened | A run that failed must not appear as a success (and vice versa) | MEDIUM | History reads `analysis_results` / `usage_tracking`; must be written only on real terminal states |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cross-analysis "recruiter's-eye" synthesis (Elite) | Most tools score one document; synthesizing resume + LinkedIn + Career Compass + Saved Jobs + Recruiting Lens into one recruiter verdict is rare and high-value | HIGH | Elite-only depth; still derived from stored outputs, no new AI call |
| Evidence-cited concerns ("what may create doubt") | Naming specific recruiter doubts (title mismatch, unexplained gap, no metrics) is more actionable than a score | MEDIUM | Maps directly to documented instant-rejection triggers |
| Profile Alignment sub-dimensions with conflicting-evidence callouts | "Skill prominent on LinkedIn but absent from resume," "quantified achievement in one profile only," "conflicting positioning" — concrete, fixable | HIGH | Requires structured field-level comparison, not text similarity |
| Deterministic, weight-driven LinkedIn total across 11 sections | Repeatable, defensible scores that genuinely separate weak/average/strong/exceptional profiles — fixes score clustering | MEDIUM | Section weights are the product; total is arithmetic, model only scores parts |
| Refresh / navigation recovery of an in-flight or completed run | "I closed the tab and lost my analysis" is a common SaaS failure; recovering it is a trust differentiator | HIGH | Persist run state server-side keyed to user+input; rehydrate on return (LinkedIn grader already rehydrates latest cached grade) |
| Explicit Merit lifecycle messaging (reserved / charged / released / refunded) | Visible, honest money handling builds trust that competitors' silent deductions don't | MEDIUM | Surface state transitions in UI copy + toasts; back end already logs `merit-transaction` / `merit-refund` |
| One sync action list ("Align My Profiles") tied to the gaps | Turns a diagnostic into a fix-it workflow | MEDIUM | ≤2 (Free) / ≤3 (Elite) actions, each pointing at the specific mismatch |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Generic/templated insight text shown as personalized | Makes an empty dashboard look "full" | Erodes trust the instant a user notices it's not about them; this is exactly what current `ProfileIntelligence` does and v5.0 forbids | Honest empty states + a CTA to run the missing analysis |
| Scoring alignment when only one profile exists | A number "feels complete" | Mathematically meaningless; implies a comparison that didn't happen | Resume-only / LinkedIn-only empty-state copy, no score emitted |
| Letting the model emit the LinkedIn TOTAL directly | "Simpler prompt" | Causes score clustering (~52/100), drift, and totals that don't match the parts | Model scores sections only; server computes weighted total deterministically |
| Forcing scores into a fixed range / curve to look encouraging | Higher scores feel nicer | Destroys the score's signal; a weak and a strong profile must diverge by 10-20+ points | Honest calibration bands; let weak profiles score low |
| Long prose paragraphs of feedback | "More text = more value" | Recruiters and users skim; walls of text bury the action | Short, evidence-anchored bullets with a quote + impact + one fix |
| Unsupported superlative claims ("recruiters love you!") | Feels motivating | Not traceable to evidence; indistinguishable from fabrication | Every claim cites a stored signal or is omitted |
| Auto-retrying every failure | "Just make it work" | Retrying a 4xx/validation/injection error wastes Merits and time, and can double-charge | Retry ONLY transient/refundable errors (5xx, 529, 408, timeout, network); surface others |
| Penalizing all resume↔LinkedIn differences as misalignment | "They should match" | Resume and LinkedIn intentionally differ (LinkedIn is broader/first-person); word-for-word matching is wrong | Flag *contradictions* (conflicting titles/dates/metrics), not stylistic differences |
| "Recruiter response" as free-text the model writes | More nuance | Unpredictable, unrankable, can't be tested or gated | Fixed 5-state enum chosen deterministically from stored signals |
| Real-time/live re-computation on every dashboard load | "Always fresh" | Burns tokens/Merits on passive page views, adds latency, violates the no-on-load-AI constraint | Derive from already-stored analysis outputs; recompute only when a new analysis is run |

---

## Feature Deep-Dives

### 1. Recruiter First Impression (replaces "Live Career Profile")

**Subtitle:** "How your current resume and LinkedIn position you to employers."

**Domain validation:** Recruiters spend ~6-8 seconds on a first pass and triage rather than evaluate, focusing on current title/company, tenure, education, and keyword/role fit. Instant-rejection triggers are concrete: title mismatch, unexplained gaps, poor formatting, no measurable achievements, no visible relevance to the target role. The section should model this triage, not a generic "profile summary."

**Component parts (all derived from stored data):**
- **Current Positioning** — one concise professional summary. Source: stored resume `grading_data` summary / Career Compass Career DNA / `analysis_results.raw_response`. No new generation.
- **What Stands Out** — evidence-backed strengths. Each item cites a stored signal (a quantified bullet, a strong section score, a keyword-rich headline).
- **What May Create Doubt** — top recruiter concerns. Map to documented rejection triggers using stored signals (e.g., low Experience metric density, missing About section, resume↔LinkedIn title conflict).
- **Likely Recruiter Response** — exactly ONE state from the fixed set, chosen deterministically:
  1. Strong shortlist potential
  2. Interested — but needs clearer positioning
  3. Competitive — but undifferentiated
  4. Relevant experience — unclear direction
  5. High potential — insufficient proof
- **One CTA:** "Strengthen My Positioning."

**Free vs Elite depth (per spec):**

| Element | Free | Elite |
|---|---|---|
| What Stands Out | up to **2** standouts | up to **3** standouts |
| What May Create Doubt | **1** concern | up to **2** concerns |
| Likely Recruiter Response | basic response | deeper response |
| Data sources synthesized | resume (+ LinkedIn if present), basic | resume + LinkedIn + Career Compass + Saved Jobs + Recruiting Lens cross-analysis |

**Mapping the 5 states to triage outcomes (recommended deterministic logic, derived from stored scores/completeness — refine in REQ/roadmap):**
- *Strong shortlist potential* — high resume + LinkedIn scores, strong metric density, clear target role, low doubt signals.
- *Interested — needs clearer positioning* — solid evidence but vague/conflicting headline/positioning.
- *Competitive — undifferentiated* — decent scores but no standout differentiator vs peers.
- *Relevant experience — unclear direction* — good experience signals but no coherent target role/field.
- *High potential — insufficient proof* — promising background but missing quantification/evidence/sections.

**Anti-features specific to this section:** no placeholder positioning text; no doubt invented without a stored signal; no free-text recruiter verdict; no long paragraphs (bullets only).

---

### 2. Profile Alignment (replaces "Activity Stream")

**Subtitle:** "See whether your resume and LinkedIn tell one consistent professional story."

**Domain validation:** Recruiters explicitly "triangulate" across resume, LinkedIn, and cover letter; the discrepancies they flag are job titles, company names, employment dates, education, performance metrics, and skills. Aligned profiles correlate with markedly higher interview rates; contradictory metrics erode trust. BUT the consensus is also clear that the two should NOT match word-for-word — LinkedIn is broader and first-person. So the feature must flag *contradictions and one-sided evidence*, not stylistic divergence.

**Component parts (all derived from stored data, comparing stored resume vs stored LinkedIn structured fields):**
- **Overall alignment score + interpretation** — computed by comparing the two stored profiles (NOT a new AI call).
- **Four sub-dimensions:**
  - Experience Consistency (titles, companies, dates, scope)
  - Skills Alignment (skill present/prominent on one profile only)
  - Positioning Alignment (headline/summary direction agreement)
  - Evidence Alignment (quantified achievement present in one profile only)
- **≤3 sync actions** — each tied to a specific detected mismatch.
- **CTA:** "Align My Profiles."

**Hard constraint — MUST NOT score when one profile is missing.** Show:
- *Resume-only* empty state (LinkedIn not graded) — copy prompting a LinkedIn grade.
- *LinkedIn-only* empty state (no analyzed resume) — copy prompting a resume analysis.
No alignment number is emitted in either case.

**Free vs Elite depth (per spec):**

| Element | Free | Elite |
|---|---|---|
| Overall score + interpretation | yes | yes |
| Sub-dimensions shown | Experience + Positioning (basic) | all 4 (Experience, Skills, Positioning, Evidence) |
| Evidence comparison depth | basic | deeper field-level evidence comparison |
| Sync actions | ≤2 | ≤3 |
| Role/job-specific alignment | no | yes, where Saved Jobs / Recruiting Lens data exists |

**Evidence examples (must be concrete, e.g.):** "React is a top-3 skill on LinkedIn but absent from your resume"; "Resume lists 'Senior Engineer', LinkedIn headline says 'Engineer'"; "'Cut infra cost 30%' appears on your resume but not LinkedIn."

**Anti-features specific to this section:** no score with a missing profile; no penalizing intentional platform-appropriate differences; no generic "keep them consistent" advice without a named mismatch; bullets not paragraphs.

---

### 3. Reliable LinkedIn Grading Rubric

**Current state (`grade-linkedin/prompts.ts` + `validation.ts`):** 4 sections — Headline (20), Experience (30), Skills & Endorsements (25), Profile Completeness (25) = 100. `validateLinkedInGrade` already enforces `rawScore === sum(section scores)` and clamps out-of-range section scores. The known bug (~52/100 clustering + repeat-run failures) stems from the model effectively anchoring the overall number and from a coarse 4-bucket rubric that can't separate similar profiles.

**v5.0 target rubric — 11 deterministic sections**, each with `earned` / `max` + `evidence` + `strengths` + `weaknesses` + `actions`; **TOTAL computed mathematically from section weights, never invented by the model:**

Headline · About · Experience · Education · Skills · Projects · Certifications · Achievements · Completeness · Career positioning · Recruiter discoverability.

**Domain validation of the 11 dimensions:** market scoring tools converge on ~6 pillars — First Impressions (banner/photo/headline), Search Optimization (keywords in high-weight fields), Narrative/Context (About length & structure), Experience Depth (bullets, metrics, progression), Authority Signals (recommendations, endorsements), Technical Polish (custom URL, contact completeness) — plus an explicit "recruiter discoverability/search visibility" axis and an SSI-style positioning axis. The v5.0 11-section split is a finer-grained, defensible superset of this. Headline is universally the highest-leverage field (indexed for search, shown everywhere) and should carry significant weight.

**What "deterministic total from weights" means (key REQ):**
- The model scores each section's `earned` against a fixed `max` (the weight), with evidence.
- The server computes `total = Σ earned` (optionally normalized to 100 if weights don't sum to 100).
- The model NEVER returns the headline number; it is recomputed and is the single source of truth (extends the existing `rawScore === sum` invariant to 11 weighted sections).
- Re-running the same profile yields a stable score (low temperature + deterministic aggregation), fixing repeat-run drift.

**What a differentiating rubric looks like across profile tiers (calibration bands — the rubric must produce real separation):**

| Profile tier | Total band | Signals the rubric should detect |
|---|---|---|
| Weak | ~20-45 | "Title at Company" headline, no About / <50 words, zero metrics in experience, <10 skills, missing education/certs, no projects/achievements, not discoverable |
| Average | ~46-65 | Some keywords, thin About, a few quantified bullets, ~10-20 skills, basic completeness, generic positioning |
| Strong | ~66-85 | Keyword-rich headline, structured 150-300w About with hook+CTA, metric-dense progression, 15-25 targeted skills, recommendations, clear positioning, searchable |
| Exceptional | ~86-95 | All of strong + standout achievements/projects, authority signals (recommendations given/received), precise role targeting, top-of-search discoverability; rarely exceeds 90-95 |

**Per-section payload (target shape):** `{ name, earned, max, evidence[], strengths[], weaknesses[], actions[] }` — evidence quotes actual profile text or names what's missing; actions are paste-ready (no `[placeholders]`).

**Free vs Elite depth (consistent with current gating model):**

| Element | Free | Elite |
|---|---|---|
| Total score + per-section earned/max | yes (all 11 sections' numbers) | yes |
| Section evidence/strengths/weaknesses | limited (e.g., Completeness + top section only, others locked) | all 11 sections fully |
| Ready-to-paste actions | 1 visible + rest locked (no hidden generation) | full set |
| Cross-section "next best action" | basic | full |

*(Current Free model: shows Profile Completeness feedback + topFixes[0], locks the rest via `stripLinkedInFreeTier`, and never generates locked content at the prompt level. Carry this exact pattern forward to 11 sections.)*

**Anti-features specific to the rubric:** model-invented total; forced score floors/ranges; sections that don't sum to the total; evidence-free section feedback; placeholder tokens in actions; long prose instead of bulleted evidence.

---

### 4. Reliable, Persistent Analysis-Run UX

**Domain validation (long-running AI job patterns):** the durable-execution consensus is — return a task ID immediately and let the client poll/subscribe; make every step idempotent with keys derived deterministically from workflow context (not the execution moment); checkpoint state so a crash/refresh resumes from the last step; show real progress; use optimistic UI that smoothly corrects; and put idempotency keys on every external write (including the charge) so retries don't duplicate side effects (double-charge / double-refund).

**Target lifecycle (from milestone spec) — one shared state machine across Onboarding Resume, Resume Analysis, LinkedIn Grader, Career Compass, Recruiting Lens:**
`created → validating_inputs → reserving_merits → extracting_data → generating → validating_output → saving → completed | retryable_failed | failed | refunded`

**Expected UX, mapped to existing infrastructure:**

| Behavior | Expectation | Existing infra to build on |
|---|---|---|
| Progress stages | Named stages with monotonic progress; never stuck/lying | `UniversalAnalyzing` (asymptotic curve, step list, scroll lock); `useResumeStream` stages |
| Disabled duplicate submit | Submit disabled while a run is active; server rejects concurrent dup | Button `disabled` + `AnalysisLockContext`; needs server idempotency key (user+feature+input hash) |
| Refresh / navigation recovery | Returning to the page restores the in-flight or completed run, not a blank form | LinkedIn grader rehydrates latest cached grade by `?id=`/cycle; generalize to a persisted run record |
| Retry only on retryable | Auto-retry only transient/refundable errors; surface the rest | `isRefundableAnthropicError` (5xx/529/408/timeout/network) + `invokeWithRetry` (no retry on 4xx≠429) |
| Previous-result preservation | A failed re-run never destroys the last good result | Don't overwrite stored row until new output validates |
| Merit messaging | Reserved / charged / released / refunded states visible and correct | `withMerits` deduct→settle/refund + `merit-transaction`/`merit-refund` logs; surface to UI |
| Accurate History | History shows real terminal state; failed/refunded runs not shown as successes | `analysis_results` + `usage_tracking` writes gated on real completion; cache-hit writes `credits=0` |

**Merit lifecycle nuance (current → target):** the codebase today does **deduct-then-refund** (`withMerits` deducts up front; `MeritRefundable` triggers `refund_merits`; refunds are idempotent via `already_refunded`). The v5.0 lifecycle reframes this as **reserve → settle/charge on success, release/refund on failure**, with exactly-once semantics. The refund taxonomy and idempotency primitives already exist; the work is making the states explicit, persisted, and surfaced — and ensuring a charge is only finalized after `saving → completed`.

**Anti-features specific to runs:** retrying non-transient errors; charging on `failed`/`retryable_failed`; double-charge on refresh; overwriting a good result with a failed retry; progress bars that complete while the call is still running; History rows for runs that never produced a saved result.

---

## Feature Dependencies

```
extract-analysis-structure (structured rows: versions, scores, recommendations)
    └──feeds──> Recruiter First Impression (standouts/concerns/positioning)
    └──feeds──> Profile Alignment (field-level resume vs LinkedIn comparison)

Stored Resume Analysis ──required──> Recruiter First Impression (Current Positioning)
Stored LinkedIn Grade  ──required──> Profile Alignment (needs BOTH profiles)
Stored Resume Analysis ──required──> Profile Alignment (needs BOTH profiles)

11-section LinkedIn rubric ──enhances──> Recruiter First Impression (discoverability/positioning signals)
11-section LinkedIn rubric ──enhances──> Profile Alignment (Skills/Positioning sub-dimensions)

Reliable run lifecycle ──underpins──> every analysis that produces the stored data above
Merit reserve/settle/refund ──part of──> Reliable run lifecycle

Career Compass + Saved Jobs + Recruiting Lens ──enhance (Elite)──> Recruiter First Impression cross-analysis
                                              ──enhance (Elite)──> Profile Alignment role/job-specific layer
```

### Dependency Notes

- **Both dashboard sections require genuine stored analyses.** With zero analyses, both show empty states — never fabricated content. This makes "honest empty states" a P1, not a polish item.
- **Profile Alignment hard-requires two profiles.** Resume-only and LinkedIn-only are first-class states that emit no score.
- **The rubric upgrade should land before/with the dashboard sections** if the new sections consume the richer 11-section signals (positioning, discoverability). At minimum the sections must tolerate both old 4-section and new 11-section stored grades (defensive rendering, as the current code already does for legacy caches).
- **The reliable-run lifecycle is foundational:** it produces and protects the stored data the sections read. A run that fabricates/half-saves output would poison the dashboard. Sequence run reliability + rubric determinism before (or alongside) the dashboard intelligence work.

---

## MVP Definition

### Launch With (v5.0 core)

- [ ] **Honest empty states** for both new sections — no placeholder-as-insight, ever (unblocks everything; cheapest trust win)
- [ ] **Recruiter First Impression** from stored data: Current Positioning, ≤2/≤3 standouts, 1/≤2 concerns, 1 of 5 fixed response states, 1 CTA — Free + Elite depth split
- [ ] **Profile Alignment** from stored data: overall score + interpretation, sub-dimensions (Free: Experience+Positioning; Elite: all 4), ≤2/≤3 actions, CTA — with mandatory missing-profile empty states (no score)
- [ ] **11-section LinkedIn rubric** with per-section earned/max + evidence + strengths + weaknesses + actions, **server-computed weighted total**, calibrated to separate weak/avg/strong/exceptional — Free locks sections/actions without hidden generation
- [ ] **Reliable run lifecycle**: progress stages, disabled duplicate submit, refresh/nav recovery, retry-only-on-retryable, previous-result preservation, Merit reserved/charged/released/refunded messaging, accurate History
- [ ] **No on-load AI calls**: both sections derive entirely from stored analysis data

### Add After Validation (v5.x)

- [ ] Elite cross-analysis depth tuning (weighting Career Compass / Saved Jobs / Recruiting Lens into the recruiter verdict)
- [ ] Role/job-specific Profile Alignment layer (when Saved Jobs / Recruiting Lens data is rich)
- [ ] Rubric weight calibration pass against a labeled set of weak/avg/strong/exceptional profiles

### Future Consideration (post-v5.0)

- [ ] Trend views (alignment/positioning over time) — defer; needs longitudinal stored data and is not a trust-critical gap
- [ ] Interview Readiness signal in the recruiter verdict — blocked on Interview Prep re-enable (out of v5.0 scope)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Honest empty states (no fabricated insight) | HIGH | LOW | P1 |
| Reliable run lifecycle + Merit reserve/settle/refund + accurate History | HIGH | HIGH | P1 |
| Deterministic weighted LinkedIn total (fix clustering) | HIGH | MEDIUM | P1 |
| Recruiter First Impression (stored-data, 5-state verdict) | HIGH | MEDIUM | P1 |
| Profile Alignment (stored-data, missing-profile guards) | HIGH | HIGH | P1 |
| 11-section rubric evidence/strengths/weaknesses/actions | MEDIUM-HIGH | MEDIUM | P1 |
| Refresh/navigation run recovery | MEDIUM-HIGH | HIGH | P2 |
| Elite cross-analysis synthesis depth | MEDIUM | HIGH | P2 |
| Role/job-specific alignment layer (Elite) | MEDIUM | HIGH | P3 |

**Priority key:** P1 = must have for v5.0 · P2 = should have · P3 = nice to have / defer.

---

## Competitor Feature Analysis

| Feature | Market tools (Resume Worded, Jobscan, LinkedInRank/SSI-style scorers) | Strivo v5.0 approach |
|---------|------------------|------------------|
| LinkedIn scoring | ~6 pillars / "30-signal" composite; some emit a single opaque number | 11 transparent sections, each earned/max + evidence; total = deterministic weighted sum |
| Recruiter perspective | "6-second scan" advice articles; few productize a per-user recruiter verdict | One of 5 fixed recruiter-response states, derived from the user's own stored signals |
| Resume↔LinkedIn consistency | Mostly advice ("keep them aligned, don't copy word-for-word") | Productized: overall score + 4 evidence-backed sub-dimensions + concrete sync actions, with no-score-when-missing guard |
| Run reliability / billing | Varies; often silent deduction, opaque failures | Explicit reserve/charge/release/refund states; charge only on saved+valid; accurate History |
| Personalization honesty | Some tools pad with generic tips | Hard rule: every insight traceable to stored evidence, else honest empty state |

---

## Sources

**LinkedIn rubric dimensions / recruiter discoverability:**
- [LinkedIn Profile Score Explained: The 30-Signal Scoring System (2026) — LinkedInRank](https://linkedinrank.com/linkedin-profile-score)
- [LinkedIn Profile Score: What's Good in 2026? — ApplyMate](https://apply-mate.com/blog/linkedin-profile-score)
- [LinkedIn Profile Optimization 2026 — ResumeVera](https://resumevera.com/blogs/linkedin-profile-optimization-guide-2026)
- [How to Optimise Your LinkedIn Profile for Recruiter Visibility (2026) — BestJobSearchApps](https://bestjobsearchapps.com/articles/en/how-to-optimise-your-linkedin-profile-for-recruiter-visibility-8-proven-steps-in-2026)

**Recruiter first impression / 6-second triage:**
- [The 6-Second Scan: What Recruiters Look for First — InHerSight](https://www.inhersight.com/blog/applying/6-second-scan)
- [How Recruiters Really Read Your Resume — Jobscan](https://www.jobscan.co/blog/how-recruiters-really-read-your-resume/)
- [How recruiters shortlist candidates & how do they reject it? — CV OWL](https://www.cvowl.com/interviews/how-recruiters-shortlist-candidates)

**Resume↔LinkedIn consistency:**
- [Should Your LinkedIn Match Your Resume? — Resume Worded](https://resumeworded.com/should-linkedin-match-resume-key-advice)
- [LinkedIn vs Resume: Why They Should Never Match Word-for-Word — GetNewResume](https://getnewresume.com/blog/linkedin-vs-resume/)
- [LinkedIn vs. Resume: What Recruiters See First — KBW Financial](https://www.kbwfinancial.com/your-linkedin-is-showing/)

**Reliable long-running run / idempotency / refund-on-failure UX:**
- [Idempotent AI Agents: Retry-Safe Patterns for Production — BuildMVPFast](https://www.buildmvpfast.com/blog/idempotent-ai-agent-retry-safe-patterns-production-workflow-2026)
- [Designing Fault-Tolerant AI Agent Pipelines: Idempotency, Retries, State — MightyBot](https://mightybot.ai/blog/fault-tolerant-ai-agent-pipelines/)
- [UI patterns for async workflows, background jobs, and data pipelines — LogRocket](https://blog.logrocket.com/ux-design/ui-patterns-for-async-workflows-background-jobs-and-data-pipelines/)

**Internal codebase (ground truth, HIGH confidence):**
- `src/pages/Dashboard.tsx` — current Live Career Profile / Activity Stream / Progress & Achievements (the sections being replaced) and the fabricated-insight patterns to eliminate
- `supabase/functions/grade-linkedin/prompts.ts`, `validation.ts`, `index.ts` — current 4-section rubric, `rawScore === sum` invariant, score clamping, Free-tier strip
- `supabase/functions/_shared/merit-gateway.ts` — `withMerits`, `MeritRefundable`, refund taxonomy, idempotent refund, cache-hit sentinel
- `src/components/UniversalAnalyzing.tsx`, `src/hooks/useResumeStream.ts`, `src/contexts/AnalysisLockContext` — run progress, scroll lock, optimistic Merit settle/rollback
- `supabase/functions/extract-analysis-structure/*` — structured stored data (versions/scores/recommendations) the dashboard sections read

---
*Feature research for: Strivo AI v5.0 dashboard intelligence + LinkedIn rubric + reliable-run UX*
*Researched: 2026-06-25*
