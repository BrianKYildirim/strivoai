# Phase 7: Dashboard Intelligence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 07-dashboard-intelligence
**Areas discussed:** Recruiter Response Rules, Evidence & Empty States, Free vs Elite Depth, Section Layout & Deletion Boundary

---

## Recruiter Response Rules (captured in earlier interrupted session, resumed via checkpoint)

| Option | Description | Selected |
|--------|-------------|----------|
| Weighted stored-signal rubric | Deterministic weighted scoring over stored signals | ✓ |
| Strict weakest-link rule | Worst signal dictates the state | |
| Primary-source priority | Resume analysis dominates, others adjust | |

**User's choice:** Weighted stored-signal rubric

| Option | Description | Selected |
|--------|-------------|----------|
| Missing data caps confidence | Absent sources limit the strongest claimable state | ✓ |
| Missing data only lowers the score | Score-only penalty | |
| No response until minimum data exists | Hard gate on minimum data | |

**User's choice:** Missing data caps confidence

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative by default | Cautious state when in doubt | ✓ |
| Encouraging but honest | Optimistic bias | |
| Middle-band biased | Cluster toward middle states | |

**User's choice:** Conservative by default

| Option | Description | Selected |
|--------|-------------|----------|
| Weakest weighted signal | CTA targets the lowest-scoring rubric signal | ✓ |
| Highest-impact missing data | CTA targets the biggest data gap | |
| Recruiter doubt first | CTA targets the top "May Create Doubt" item | |

**User's choice:** Weakest weighted signal

---

## Evidence & Empty States

| Option | Description | Selected |
|--------|-------------|----------|
| Inline source tag | Always-visible badge per insight naming the producing feature | ✓ |
| Hover/tap detail | Source + quote in tooltip/popover | |
| Quoted evidence snippet | Verbatim excerpt paired with each insight | |

**User's choice:** Inline source tag

| Option | Description | Selected |
|--------|-------------|----------|
| Show with staleness note | Use latest data, flag age/desync | ✓ |
| Silent — always use latest | No age indication | |
| Age threshold gates insights | Past cutoff, downgrade to re-run prompt | |

**User's choice:** Show with staleness note

| Option | Description | Selected |
|--------|-------------|----------|
| Action-first, one CTA | Short missing-data line + single button; reuses EmptyState | ✓ |
| Preview skeleton + CTA | Greyed structure preview plus CTA | |
| Minimal — hide harder | Collapse data-less sections to a slim row | |

**User's choice:** Action-first, one CTA

| Option | Description | Selected |
|--------|-------------|----------|
| Degrade to what's valid | Use intact signals, drop broken ones, confidence cap communicates | ✓ |
| Treat as no-data | Any failure zeroes the section to empty state | |
| Show error state | Distinct "couldn't process — retry" card | |

**User's choice:** Degrade to what's valid

---

## Free vs Elite Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Locked teasers | Blurred/lock rows with upgrade prompt (matches MiniMeter locks) | ✓ |
| Hidden entirely | No hint of Elite content for Free | |
| Single upgrade footer | One compact upsell line per section | |

**User's choice:** Locked teasers

| Option | Description | Selected |
|--------|-------------|----------|
| Resume + LinkedIn only | Free uses core profile sources; enrichment is Elite | ✓ |
| All available sources | Tier gap only in counts/depth | |
| Whatever their tier could generate | Data gated by generation-time paywall | |

**User's choice:** Resume + LinkedIn only

| Option | Description | Selected |
|--------|-------------|----------|
| Pro = Elite | Pro gets full Elite depth in both sections | ✓ |
| Pro = Free | Only Elite unlocks deeper analysis | |
| Pro in between | Elite counts without cross-analysis sources | |

**User's choice:** Pro = Elite

| Option | Description | Selected |
|--------|-------------|----------|
| Shared derivation module | Pure TS module computes model + tier caps; unit-testable | ✓ |
| Per-component logic | Each section derives inline | |
| You decide | Planner picks | |

**User's choice:** Shared derivation module

---

## Section Layout & Deletion Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing patterns | Same SectionHeader/EmptyState/card primitives and spacing | ✓ |
| Distinct intelligence styling | New premium visual identity | |
| Reuse structure, new visuals inside | Same shell, new inner components | |

**User's choice:** Reuse existing patterns

| Option | Description | Selected |
|--------|-------------|----------|
| Full dead-code removal | Delete components + now-unused queries/helpers/types, verified sweep | ✓ |
| Components only | Remove JSX only, leave hooks | |
| You decide | Planner draws the boundary | |

**User's choice:** Full dead-code removal

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to own files | src/components/dashboard/ + src/lib derivation module | ✓ |
| Inline in Dashboard.tsx | Follow current inline-section convention | |

**User's choice:** Extract to own files

| Option | Description | Selected |
|--------|-------------|----------|
| Automated + operator smoke | Unit + Playwright + manual visual pass (Phase 6 model) | ✓ |
| Mostly automated | Full matrix in Playwright with screenshot assertions | |
| Mostly manual | Unit tests only; visual matrix by hand | |

**User's choice:** Automated + operator smoke

---

## Claude's Discretion

- Exact rubric weights, normalization, and threshold values (within conservative-by-default)
- Staleness-note wording and trigger heuristics
- Derivation-module internal structure and file naming
- Locked-teaser visuals within the existing locked-pattern language

## Deferred Ideas

None — discussion stayed within phase scope.
