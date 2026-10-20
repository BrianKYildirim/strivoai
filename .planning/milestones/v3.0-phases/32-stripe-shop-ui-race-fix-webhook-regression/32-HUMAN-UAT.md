---
status: passed
phase: 32-stripe-shop-ui-race-fix-webhook-regression
source: [32-VERIFICATION.md]
started: 2026-05-21T01:03:30Z
updated: 2026-06-08
---

## Current Test

[complete]

## Tests

### 1. At-Cap Purchase End-to-End
expected: A Pro user at 75/75 buys a 3-pack via Stripe test-mode. The header (MeritBalanceHeaderV2) shows `78 / 75` within 10s of Stripe confirmation, with no bonus chip and no error toast. Why human: real webhook delivery latency (the `credit_shop_merits` write landing after Stripe returns `succeeded`) cannot be replicated with fake timers — this is the exact race the phase fixes (MER-07, MER-08).
result: pass - operator smoke attestation 2026-06-08; at-cap top-up completed and header updated correctly within the expected window.

### 2. Processing-Status Toast Copy
expected: Triggering a `processing`-status payment fires a toast reading exactly `Merits processing — they'll appear shortly`, and the modal closes immediately (before the poll lands). Why human: requires a real Stripe test-mode payment that resolves to `processing` status (MER-08 toast copy).
result: pass - operator smoke attestation 2026-06-08; processing-status toast/modal behavior worked properly.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None. Live Stripe smoke was operator-confirmed passed on 2026-06-08.
