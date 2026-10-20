# The load ladder — stages, gates, and stop criteria

**One rung per run. No auto-escalation.** After every stage: stabilize → collect →
decide → stop if degraded → record the first bottleneck. Only advance if EVERY
stop-criterion is clear.

## Dimensions are independent — do not conflate

| Dimension | Meaning | Scenario | Cap |
|---|---|---|---|
| Concurrent browsing sessions | Users loading the dashboard (cheap reads) | 01, 11 | 10 000 |
| Requests/second | Raw RPS at an endpoint | 02, 04, 07 | 2 000 |
| Concurrent uploads | Simultaneous PDF uploads | 03 | 500 |
| Queued analyses | Jobs enqueued (queue depth) | 05 | 1 000 |
| Executing analyses | Analyses running the model AT ONCE | 10 | 250 (500/1000 gated) |
| DB connections | Pooler connections in use | 07 (measured) | 60 |
| Realtime connections | Held websocket subscriptions | 08 | 5 000 |

> 10 000 browsing sessions ≠ 10 000 executing analyses. The executing-analysis cap is
> deliberately ~40× lower — it is the scarcest, most expensive dimension.

## Executing-analyses ladder (workload 10)

`1 → 5 → 10 → 25 → 50 → 100 → 250 → [500 → 1000]`

- Rungs **500 and 1000** require `REAL_AI_HIGH_CONCURRENCY=confirmed` AND every lower
  rung verified safe. Keep the provider MOCKED at these rungs; real-AI stays at ≤10.

## Browsing-sessions ladder (workloads 01 / 11)

`100 → 500 → 1000 → 2500 → 5000 → [10000]`

- **10 000** only if every prior rung stayed safe.

## STOP a stage immediately if ANY of these occur

(These map to abort thresholds in `config/thresholds.js` and invariant checks in
`tools/measure-supabase.mjs`.)

1. Accepted analysis jobs are **lost** (`lost_accepted_runs > 0`).
2. **Duplicate jobs** created (`duplicate_active_jobs` returns rows).
3. Merits charged incorrectly / **double-charged** (`duplicate_merit_charges` rows, or
   balance drift vs ledger).
4. Completed results **cannot be retrieved**.
5. **Raw technical errors** reach users.
6. Failure rate rises materially (`http_req_failed rate ≥ 2%` or `business_errors > 0`).
7. **p95 / p99** latency rises uncontrollably (class thresholds breached).
8. **Queue depth** keeps growing without recovery.
9. **DB or worker** capacity approaches unsafe levels (connections near cap 60).
10. Environment becomes unstable.
11. Projected/real **spend exceeds the cap** ($5 real provider; $25 infra projection).

## Per-stage loop

```
node tools/preflight.mjs                       # once per session
node tools/run-stage.mjs --scenario <s> --profile ramp --target <rung> \
     --measure-duration 300                    # runs ONE rung + side-channel
# review k6 summary + results/metrics-*.jsonl
# fill results/RESULTS-TEMPLATE.md for this rung
# DECIDE: safe to advance? if yes, re-run with the next --target. if no, STOP.
```
