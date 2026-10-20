# Phase 15: resume-analysis-gating - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-15
**Phase:** 15-resume-analysis-gating
**Areas discussed:** Tier source + Elite field delivery, Free-shape enforcement, Parallel-call budget split, Legacy flag-off behavior

---

## Tier Source + Elite Field Delivery

### Q1: Where should analyze-resume read the user's tier from?

| Option | Description | Selected |
|---|---|---|
| subscriptions table | Server-side lookup by userId against Phase 12 subscriptions (ignore rawBody.tier). | ✓ |
| JWT custom claim | Read from JWT app_metadata. Fast but requires Stripe webhook to also update auth.users. | |
| Hybrid JWT + DB fallback | JWT fast path, DB fallback if missing. Best latency; two enforcement points. | |

**User's choice:** subscriptions table.
**Notes:** Phase 12 establishes subscriptions as Stripe-authoritative.

### Q2: How should 6 Elite-only fields be produced?

| Option | Description | Selected |
|---|---|---|
| 4th parallel call, Elite only | Add 'elite-extras' to CALL_CONFIGS; fires only when tier==='elite'. | ✓ |
| Fold into summary call | Expand summary's Elite branch; maxTokens balloons to ~6000+. | |
| Separate sequential request | Dependent call after the 3 parallel complete; +8–15s latency for Elite. | |

**User's choice:** 4th parallel call, Elite only.

### Q3: Tier lookup caching strategy?

| Option | Description | Selected |
|---|---|---|
| Read once, pass through | Single subscriptions.select at top of handler. | ✓ |
| Read on every gateway call | withMerits re-resolves each call; risks mid-request drift. | |

**User's choice:** Read once, pass through.

### Q4: Fallback tier when subscription row missing?

| Option | Description | Selected |
|---|---|---|
| Default to Free | Fail-closed on cost. | ✓ |
| Fail 403 | Force Stripe webhook correctness; blocks signups during race window. | |

**User's choice:** Default to Free.

### Q5: Merit deduction scope?

| Option | Description | Selected |
|---|---|---|
| One deduction wraps all calls | Single withMerits around entire fan-out. Matches Phase 13 D-03. | ✓ |
| Per-call deduction | 1 Merit per call; doesn't match the 3/2/3 cost table. | |

**User's choice:** One deduction wraps all calls.

---

## Free-Shape Enforcement

### Q1: How to enforce Free output shape?

| Option | Description | Selected |
|---|---|---|
| Prompt + server-side strip | Both layers. Leaky prompt cannot reach Free users. | ✓ |
| Prompt-only + harness | Trust loader + opt-in TEST-09 harness. Risks prod regressions between runs. | |
| Prompt + strip + hash-pin | Above + boot-time prompt SHA assertion. Overkill for Phase 15. | |

**User's choice:** Prompt + server-side strip.

### Q2: priorityImprovements cap enforcement?

| Option | Description | Selected |
|---|---|---|
| Server-side slice | Update capPriorityImprovements to {free:1, pro:5, elite:7}. | ✓ |
| Prompt-only | Trust 'exactly 1' instruction; model may still return 2–3. | |

**User's choice:** Server-side slice.

### Q3: Where does the tier-shape guard live?

| Option | Description | Selected |
|---|---|---|
| result-merger.ts end of merge | applyTierShape(merged, tier) as final merger step. Single exit point. | ✓ |
| New _shared/tier-output-shaper.ts | Handler must remember to call; easy to forget in Phases 16–18. | |
| Inline in analyze-resume handler | Future features reimplement. | |

**User's choice:** result-merger.ts, end of merge.

### Q4: C1-only-feedback rule enforcement?

| Option | Description | Selected |
|---|---|---|
| Prompt instructs + shaper strips | Deterministic shape even if model returns full feedback. | ✓ |
| Prompt-only | Fragile without strip. | |

**User's choice:** Prompt + shaper.

---

## Parallel-Call Budget Split

### Q1: How to split per-tier maxTokens cap across parallel calls?

| Option | Description | Selected |
|---|---|---|
| Evidence-weighted (~30/30/40) | Summary gets largest share; Free 1800/1800/2400, Pro 4800/4800/6400, Elite 5000/5000/6000 + 4000 extras. | ✓ |
| Equal split | Clean math; wastes criteria tokens, starves summary. | |
| Defer to researcher empirical measurement | Rigorous; adds round-trip. | |

**User's choice:** Evidence-weighted split.

### Q2: Where do per-tier maxTokens values live?

| Option | Description | Selected |
|---|---|---|
| analyze-resume CALL_CONFIGS | Feature-specific budgets in feature handler; tier-config owns the cap. | ✓ |
| tier-config.ts owns everything | Bloats module, leaks feature internals. | |

**User's choice:** CALL_CONFIGS in analyze-resume.

### Q3: Is 4000 tokens enough for elite-extras (6 fields)?

| Option | Description | Selected |
|---|---|---|
| 4000 is fine | ~600 tokens per narrative field + margin. Measure and adjust later. | ✓ |
| Bigger — shrink Pro base | Worse rubric depth for the paying tier. | |
| Split into 2 elite calls | 5 parallel calls; more latency risk. | |

**User's choice:** 4000 is fine; measure in validation.

---

## Legacy Flag-Off Behavior

### Q1: Does tier gating apply when MERIT_SYSTEM_ENABLED=false?

| Option | Description | Selected |
|---|---|---|
| Both paths tier-gated | Flag only gates billing, not output shape. Decouples two risky changes. | ✓ |
| Flag gates everything | Safer rollback but couples Merit + tier gating into one deploy. | |
| Tier gating only for Elite (new fields) | Avoids 'Free output shrunk' moment; creates downgrade-at-flip. | |

**User's choice:** Both paths tier-gated.

### Q2: Legacy quota accounting under new Free shape?

| Option | Description | Selected |
|---|---|---|
| 1 quota unit | Per-analysis, not per-token. | ✓ |
| Adjust legacy limits | Drifts two paths apart; complicates cutover. | |

**User's choice:** 1 quota unit (no legacy cap adjustment).

---

## Claude's Discretion

Captured in CONTEXT.md under "Claude's Discretion (Researcher / Planner decides)":

- Exact FREE_ALLOWED_FIELDS list — planner derives from RES-01 spec §4.1.
- Whitelist-keep vs blacklist-strip implementation inside applyTierShape.
- Exact Pro / Elite additive field lists — planner derives from RES-03 / RES-04.
- Elite-extras prompt builder tone/temperature/system block shape.
- Whether resolveTier() is extracted to _shared/resolve-tier.ts in Phase 15 or Phase 16.
- Boot-time assertion location (analyze-resume vs tier-config).

## Deferred Ideas

- Tier gating for LinkedIn / Career / Recruiting Lens / Interview Prep → Phases 16–19.
- Rich Results.tsx presentation of Elite fields → Phase 20.
- TEST-09/10 in CI on every PR → still deferred from Phase 14.
- Refactoring async queue path (submit-/process-resume-analysis-job) for tier gating → follow-up if async resume analysis re-emerges.
- Extracting resolveTier() helper → lazy, Phase 16+.
