# Phase 24: pricing-merit-economy-and-top-up-packs-update — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `24-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-21
**Phase:** 24-pricing-merit-economy-and-top-up-packs-update
**Areas discussed:** Central config shape & ownership, Free-tier monthly allocation vs lifetime, Token budget rewiring scope, Design system rebrand scope

**Gap-closure pass (2026-04-21):** Token-budget verbatim lock, Rollout & live-subscriber safety, Top-up purchase UX flow, Boot-invariant failure mode

---

## Central Config Shape & Ownership

### Q1 — Where should the central config live?
| Option | Description | Selected |
|--------|-------------|----------|
| Shared TS module, dual-imported | Single .ts file imported by both Vite frontend and Deno edge functions | ✓ |
| DB-driven seed tables | Postgres tables seeded at deploy; FE reads via Supabase client | |
| Hybrid: DB for costs, TS for tokens/pricing | Mixed — DB stores merit costs, TS stores token/pricing constants | |

**User's choice:** Shared TS module, dual-imported.

### Q2 — How should FE and BE stay in sync?
| Option | Description | Selected |
|--------|-------------|----------|
| Single file, both import | One canonical .ts file, both sides import directly | ✓ |
| Two mirrored files + test assertion | Separate files for FE/BE, test verifies they match | |
| FE reads from /api endpoint on boot | FE fetches config from a backend endpoint at startup | |

**User's choice:** Single file, both import.

### Q3 — `merit_feature_costs` interaction with central config?
| Option | Description | Selected |
|--------|-------------|----------|
| DB stays source of truth | DB is canonical at runtime; TS mirror checked at boot | ✓ |
| Migrate costs fully to TS | Drop the DB table; TS becomes the only home | |
| Seed DB from TS at migration time | TS is canonical; migrations regenerate DB rows | |

**User's choice:** DB stays source of truth; startup assertion diffs DB vs TS.

### Q4 — `merit_transactions.source` enum migration?
| Option | Description | Selected |
|--------|-------------|----------|
| Additive: allow both 'shop' and 'topup' | Existing rows untouched; new rows write 'topup' | ✓ |
| Rename in-place | Migration rewrites all 'shop' → 'topup' | |
| Keep 'shop' internally | Don't add 'topup'; reuse 'shop' for new pack purchases | |

**User's choice:** Additive — both values accepted; new rows use 'topup'.

---

## Free-tier: Monthly Allocation vs Lifetime

### Q1 — What anchors the monthly merit reset for Free users (no Stripe sub)?
| Option | Description | Selected |
|--------|-------------|----------|
| Signup anniversary day (Recommended) | Reset on day-of-month they created the account; matches Pro/Elite anniversary pattern | ✓ |
| Calendar month (1st) | Everyone resets on the 1st; risks thundering-herd | |
| Rolling 30 days from last reset | Reset 30 days after last top-up; new state and divergent logic | |

**User's choice:** Signup anniversary day-of-month.

### Q2 — Existing Free users when MERITS_PER_MONTH = { free: 10 } ships?
| Option | Description | Selected |
|--------|-------------|----------|
| Apply at next anniversary (Recommended) | No retroactive mutation; honors SC-2 | ✓ |
| Top-up to 10 immediately if below 10 | Bring everyone up to floor on deploy | |
| Apply at next reset, but log delta | Same as recommended + audit log of (old, new) | |

**User's choice:** Apply at next anniversary; no retroactive mutation.

### Q3 — Can Free users buy Merit Top-Up Packs?
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — anyone with a Stripe customer can purchase (Recommended) | Top-up balance is tier-independent; conversion path | ✓ |
| Pro/Elite only | Gate behind subscription | |
| Yes for unlocked features only | Allowed but recruiting-lens / interview-prep stay locked | |

**User's choice:** Yes — anyone can purchase.

### Q4 — Header `+` icon trigger logic for Free (cap=10)?
| Option | Description | Selected |
|--------|-------------|----------|
| Same 20% rule, no special-case (Recommended) | Free shows `+` at ≤2 monthly merits; consistent | ✓ |
| Free shows `+` at any time | Always-visible top-up CTA on Free | |
| Free uses absolute threshold (≤3 merits) | Pro/Elite use 20%, Free uses fixed ≤3 | |

**User's choice:** Same 20% rule for all tiers.

---

## Token Budget Rewiring Scope

### Q1 — Where do the three new tables (output / inputTokens / inputChars) live?
| Option | Description | Selected |
|--------|-------------|----------|
| Extend tier-config.ts (Recommended) | Add per-feature × per-tier tables alongside existing exports | ✓ |
| New file: feature-budgets.ts | Separate file under _shared/; tier-config keeps timeouts/models only | |
| Co-locate with merit costs in central pricing module | One mega-file: MERITS, COSTS, PRICING, BUDGETS | |

**User's choice:** Extend tier-config.ts.

### Q2 — How do existing per-feature handlers absorb the new per-feature output budgets?
| Option | Description | Selected |
|--------|-------------|----------|
| Each handler reads its own number from the shared table (Recommended) | Local CALL_CONFIGS asserted against new per-feature budget | ✓ |
| Move all CALL_CONFIGS to central config | Per-call splits live alongside the budget tables | |
| Single budget per feature, handler distributes at runtime | Drop static splits; handler decides dynamically | |

**User's choice:** Handler reads its own number; local CALL_CONFIGS retuned.

### Q3 — Where does input guardrail enforcement (max input tokens AND chars) live?
| Option | Description | Selected |
|--------|-------------|----------|
| Shared validator called by each handler (Recommended) | New _shared/input-guard.ts with validateInputBudget(...) | ✓ |
| Inside merit-gateway | Add input-budget check to existing gateway | |
| Per-handler inline validation | Each function does its own check using the table | |

**User's choice:** Shared validator (`_shared/input-guard.ts`).

### Q4 — Format for the SC-13 reconciliation artefact?
| Option | Description | Selected |
|--------|-------------|----------|
| Markdown audit table per feature (Recommended) | 24-AUDIT.md with per-feature tables; matches v2.0-MILESTONE-AUDIT.md style | ✓ |
| JSON manifest | Machine-readable diff for tooling | |
| Both: JSON + summary markdown | Machine + human; doubles upkeep | |

**User's choice:** Markdown audit table per feature.

---

## Design System Rebrand Scope

### Q1 — Scope of the rebrand — just /pricing or sitewide?
| Option | Description | Selected |
|--------|-------------|----------|
| /pricing-scoped, sitewide later (Recommended) | Apply only on /pricing + top-up surfaces; sitewide deferred | ✓ |
| Sitewide token swap | Replace --background, --primary, --radius globally | |
| /pricing + dashboard top-up surfaces only | Pricing + the in-app top-up surfaces in SC-9 | |

**User's choice:** /pricing-scoped (which by SC-9 includes the in-app top-up surfaces it owns).

### Q2 — Token strategy for the new brand values?
| Option | Description | Selected |
|--------|-------------|----------|
| New brand-v2 token namespace (Recommended) | Add --bg-deep, --accent-red, --radius-boxy; opt in via wrapper class | ✓ |
| Override --background / --primary / --radius on the pricing page | Same vars, scoped override | |
| Replace tokens globally now | Edit src/index.css :root values | |

**User's choice:** New brand-v2 token namespace.

### Q3 — Fonts (Fraunces / JetBrains Mono / Inter Tight) — how loaded?
| Option | Description | Selected |
|--------|-------------|----------|
| Google Fonts CDN with display=swap (Recommended) | preconnect + Google Fonts CSS in index.html | ✓ |
| Self-host (woff2 in /public/fonts) | Privacy + offline; +300–500 KB to repo | |
| Subset + self-host display font, CDN for body/mono | Hybrid | |

**User's choice:** Google Fonts CDN with display=swap.

### Q4 — Boxy CTAs — how do we enforce no rounded-full regression on /pricing?
| Option | Description | Selected |
|--------|-------------|----------|
| New 'boxy' Button variant + lint test (Recommended) | variant=boxy in Button + vitest scan that fails on rounded-full Button on /pricing | ✓ |
| Override Button radius via CSS scope | .pricing-page button { border-radius: var(--radius-boxy) !important; } | |
| Code review only | No structural enforcement | |

**User's choice:** boxy Button variant + vitest scan.

---

## Claude's Discretion

- Internal `CALL_CONFIGS` per-call split values inside `analyze-resume` and `recruiting-lens` (planner picks split that respects D-10's new budget total).
- Exact CSS-var values for `--radius-boxy` and the glassmorphism / ambient-glow tokens.
- Stripe price-ID env-var naming convention.
- 413-style error response JSON envelope.
- Toast copy for top-up confirmation.

## Deferred Ideas

- Sitewide brand-v2 rebrand (out of scope per D-15).
- Self-hosted fonts.
- Removal of deprecated `TIER_MAX_TOKENS` export.
- Removal of deprecated monthly Stripe price IDs.
- Promotion of brand-v2 tokens to default token names.

---

# Gap-Closure Pass (2026-04-21)

**Reason:** Update-existing session surfaced 3 gaps not covered in the original discussion + user re-emphasized SC-12 verbatim lock.

---

## Token-Budget Verbatim Lock

User pasted the SC-12 spec twice to emphasize per-feature verbatim enforcement.
ROADMAP.md §SC-12 (lines 468–497) verified cell-by-cell against the pasted spec — 100% match.
4:1 `maxCharactersInput` ÷ `maxTokensInput` invariant holds on every non-null row.

**Captured as D-19:** Per-feature enforcement mandatory via typed accessors; `validateInputBudget` checks BOTH token + char budgets; vitest snapshot guard required against SC-12 tables.

---

## Rollout & Live-Subscriber Safety

### Q1 — How do existing monthly Pro/Elite subscribers experience the rollout?
| Option | Description | Selected |
|--------|-------------|----------|
| Grandfather in place | Existing subs stay on current Stripe price IDs forever; new signups see annual + new-monthly only | ✓ |
| Prompt to switch at renewal | Banner/email at T-7 days with proration opt-in | |
| Auto-migrate at renewal | Silent move to new-monthly SKU next renewal | |

**User's choice:** Grandfather in place. → **D-20**

### Q2 — How do new budgets + merit caps (SC-1, SC-12) roll out?
| Option | Description | Selected |
|--------|-------------|----------|
| Immediate — no gating | New caps apply at deploy; existing balances unchanged per D-06 | ✓ |
| Env-flag ramp 0→10→100 | `MERIT_V2_ENABLED` dark-launch for rollback safety | |
| Paid-only flag, Free immediate | Finer control since Pro/Elite could feel it as cut | |

**User's choice:** Immediate — no gating. → **D-21**

### Q3 — Deploy order for additive enum + pack-credit RPC (D-04)?
| Option | Description | Selected |
|--------|-------------|----------|
| Migrations first, then code | DB migration lands first; code deploy follows; forward-compatible | ✓ |
| Single atomic deploy | Code + migration together; riskier rollback | |
| Feature-flag write path | Migrations silent, flag gates pack-credit writes | |

**User's choice:** Migrations first, then code. → **D-22**

---

## Top-Up Purchase UX Flow

### Q1 — How does user complete a pack purchase?
| Option | Description | Selected |
|--------|-------------|----------|
| Stripe Checkout redirect | Matches existing subscription flow; least PCI surface | |
| Embedded Payment Element | `@stripe/react-stripe-js`; stays in-app; better mobile conversion | ✓ |
| Checkout in new tab/popup | Avoids redirect but popup-blocker risk | |

**User's choice:** Embedded Payment Element. → **D-23**
*Note: diverges from subscription flow — both paths must be supported.*

### Q2 — Where is the canonical pack catalog?
| Option | Description | Selected |
|--------|-------------|----------|
| `/pricing` below tiers | Single source of truth at `#packs`; other surfaces deep-link | ✓ |
| Standalone `/shop` or `/top-up` | Dedicated route; cleaner separation | |
| Inline everywhere | No canonical home; duplicates SC-8 hierarchy in 3 places | |

**User's choice:** `/pricing` below subscription tiers. → **D-24**

### Q3 — Post-purchase flow after webhook credits merits?
| Option | Description | Selected |
|--------|-------------|----------|
| Return to origin + toast + live header | Redirect to page of origin; Sonner toast in SC-10 format; live balance refresh | ✓ |
| Always return to `/pricing` | Dedicated success banner; simpler routing | |
| Global modal on any page | "You're ready to analyze!" with continue CTA | |

**User's choice:** Return to origin + toast + live header refresh. → **D-25**

---

## Boot-Invariant Failure Mode

### Q1 — When do D-03 / D-10 invariants run?
| Option | Description | Selected |
|--------|-------------|----------|
| Module-load (cold start) only | Once per isolate boot; cached in module scope | ✓ |
| Every request | Catches mid-isolate DB drift; more CPU | |
| CI/build-time only | Snapshot-diff test; no runtime guard | |

**User's choice:** Module-load only. → **D-26**

### Q2 — Fail policy if invariant trips in prod?
| Option | Description | Selected |
|--------|-------------|----------|
| Fail-closed: 500 until fixed | Isolate fails to boot; all requests 500 | ✓ |
| Fail-open: log + TS fallback | Users keep working but may be charged wrong | |
| Fail-degraded: disable affected feature | Per-feature try/catch | |

**User's choice:** Fail-closed. → **D-27**

### Q3 — Observability for invariant trips?
| Option | Description | Selected |
|--------|-------------|----------|
| Structured log + Supabase function-log alert | Reuses `_shared/logger.ts`; no new deps | ✓ |
| Sentry (or similar) capture | New dep + DSN secret | |
| Log only — manual inspection | Minimal; high MTTR | |

**User's choice:** Structured log + Supabase alert. → **D-28**

