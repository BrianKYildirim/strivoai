---
phase: 04-incremental-elite-unlock-for-previously-analyzed-free-tier-resumes
plan: 04
status: complete
completed: 2026-07-31
commits:
  - f51baf2f
  - 25ff06be
  - 2c760ee3
  - 32360b5a
  - 8f22b0c0
  - fbc014dd
  - b5107060
---

# Plan 04-04 Summary

Replaced clone-and-rerun behavior with an accessible same-row Elite unlock on
the existing Results route and completed the operator-gated preview proof.

## Delivered

- `useEliteRerun` starts one stable `mode: 'elite_unlock'` request against the
  original resume ID and never inserts or clones a resume row.
- Results uses the database-priced approved CTA, all five locked progress
  strings, same-page authoritative reread, safe retry/fresh-analysis states,
  and no CTA or overlay after completion/reload.
- The live E2E proves exact Free-owned projection preservation, same-row Elite
  promotion, one merit debit, one incremental history mirror, one linked usage
  record, durable replay convergence, and no additional work on revisit.
- Changed content remains on Upload's unique-hash normal full-analysis path.

## Real-provider compatibility fix

The first approved real-provider preview run returned the locked safe failure
state. Content-free telemetry showed both incremental calls rejected with HTTP
400 before token generation. The direct Anthropic client had sent raw schemas
containing unsupported `minLength`/`minItems`/`maxItems` constraints and an open
`eliteInsights` object.

The wire schemas now omit unsupported grammar constraints, set
`additionalProperties: false` on every object, and describe the existing six
Elite insight fields explicitly. Existing Zod and semantic validators continue
to enforce non-empty and allowlisted values. A recursive Deno regression test
locks the raw schema contract.

## Verification

- Focused structured-output/helper matrix: 26 passed, 0 failed.
- Deterministic gated Elite browser run: 2 passed, 0 failed.
- Mandatory guarded staging deploy: all seven `verify:baseline` lanes green,
  no skip switches; only `analyze-resume` deployed to preview.
- Real-provider gated Elite browser run: 2 passed, 0 failed in 1.8 minutes.
- Successful telemetry under request `e4ea18d1`:
  - row 6, `elite-unlock-extras`: 1,278 input / 903 output tokens,
    `end_turn`, 84.95% headroom, not truncated.
  - row 7, `elite-unlock-details`: 2,012 input / 3,311 output tokens,
    `end_turn`, 44.82% headroom, not truncated.
- Changed-content Upload/full-analysis check: 2 passed, 0 failed and exactly
  one new completed resume row.
- Final preview function readback: `analyze-resume` ACTIVE version 297.
- Preview `AI_TEST_MODE=true` restored after the real run.

## Environment boundary

All mutations targeted preview ref `cimjltzovkahkqecpwgi`. Production ref
`zjpjapgraoxdukdvpjes` was not linked, migrated, deployed, or tested.
