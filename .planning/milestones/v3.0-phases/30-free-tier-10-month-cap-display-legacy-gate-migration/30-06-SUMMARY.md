***

phase: 30
plan: 06
status: complete
completed: 2026-05-19
requirements: \[MER-11, MER-12]
files\_modified:

* .planning/REQUIREMENTS.md
* .planning/ROADMAP.md
* .planning/PROJECT.md
* .planning/STATE.md

***

# Phase 30 Plan 06 — Doc Reconciliation (D-17 spec amendment)

Reconciled the four planning documents with Phase 30's shipped implementation reality and the D-17 spec amendment. Dropped "Bonus chip retained as secondary indicator" wording from `REQUIREMENTS.md` MER-11 and `ROADMAP.md` Phase 30 SC #3; refreshed `PROJECT.md` "Current State" and `STATE.md` "Accumulated Context" so the Free-tier description reads "10 monthly replenishing" instead of the v2.0 "5 lifetime" wording. One commit per the D-17 directive.

## Text-substitution diffs

### `.planning/REQUIREMENTS.md` (line 39 — MER-11)

**Old:**

```
**MER-11**: Merit balance UI displays as `total / cap` with `total = subscription + shop` where total can exceed cap (e.g. `78 / 75`). (Decision: simplify two-bucket display in `MeritBalanceHeaderV2.tsx:42-62` to single value `subscription+shop`. Bonus chip retained as secondary indicator.)
```

**New:**

```
**MER-11**: Merit balance UI displays as `total / cap` with `total = subscription + shop` where total can exceed cap (e.g. `78 / 75`). (Decision: simplify two-bucket display in `MeritBalanceHeaderV2.tsx:42-62` to single value `subscription+shop`.)
```

### `.planning/ROADMAP.md` (line 147 — Phase 30 SC #3)

**Old:**

```
3. `MeritBalanceHeaderV2` renders a single value (`subscription + shop`) over `cap`, e.g. `78 / 75`, with the bonus chip retained as a secondary indicator.
```

**New:**

```
3. `MeritBalanceHeaderV2` renders a single value (`subscription + shop`) over `cap`, e.g. `78 / 75`, with no bonus chip (bonus visibility lives in the popover body).
```

### `.planning/PROJECT.md` (line 11 — Current State, v2.0 shipped state)

**Old:**

```
* Merit-system live in production (Free 10 / Pro 75 / Elite 150 monthly merits via Phase 24 retune; lifetime grant for new Free signups; subscription resets monthly, shop / top-up never expires)
```

**New:**

```
* Merit-system live in production (Free 10 / Pro 75 / Elite 150 monthly merits, replenishing monthly via Phase 30 migration from prior v2.0 "5 lifetime" Free grant; subscription resets monthly, shop / top-up never expires)
```

Rationale: line 11 previously said "Free 10" but also "lifetime grant for new Free signups" — internally contradictory. Post-Phase-30 reality is monthly replenish; the "lifetime grant" clause was dropped and the v2.0 origin captured as a migration footnote so the historical lineage stays traceable. Lines 56–78 (Previous Milestone: v2.0 Merit System & Monetization) are clearly retrospective and were left untouched per Task 2 guidance.

### `.planning/STATE.md` (line 73 — Accumulated Context)

**Old:**

```
* Merit-system tier caps live in production: Free 5 lifetime / Pro 75 monthly / Elite 150 monthly. **v3.0 raises Free to 10 monthly cap (replenishing, not lifetime) — Phase 30.**
```

**New:**

```
* Merit-system tier caps live in production: Free 10 monthly / Pro 75 monthly / Elite 150 monthly. **(Free raised from 5-lifetime to 10-monthly-replenishing via Phase 30 — see `.planning/phases/30-*` for migration trail.)**
```

## Grep gates (all passing)

| Gate                                                                    | Result           |
| ----------------------------------------------------------------------- | ---------------- |
| `bonus chip retained` (case-insensitive) in REQUIREMENTS.md, ROADMAP.md | No matches       |
| `5 lifetime` (case-insensitive) in STATE.md                             | No matches       |
| `Free 10 / Pro 75 / Elite 150 monthly` in PROJECT.md                    | Matches line 11  |
| `Free 10 monthly` in STATE.md                                           | Matches line 73  |
| `MER-11.*Merit balance UI displays` in REQUIREMENTS.md                  | Matches line 39  |
| `no bonus chip` in ROADMAP.md                                           | Matches line 147 |

## Commit

Single commit, D-17-mandated message verbatim:

```
docs(30): amend MER-11 wording — drop bonus chip from header trigger
```

## Self-Check: PASSED

* All four files updated per `30-06-PLAN.md` `must_haves.truths`.
* D-17 commit message used verbatim.
* No retrospective v2.0 wording was modified (lines 56–78 of PROJECT.md remain untouched).
* Phase 30 SC #5 satisfied: `PROJECT.md` "Current State" and `STATE.md` "Accumulated Context" now agree with each other and with production reality.

