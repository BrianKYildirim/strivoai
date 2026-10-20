# Stage results — <SCENARIO> / <DIMENSION> / rung <TARGET>

> One copy per rung. Fill from the k6 summary + `results/metrics-*.jsonl`. Numbers only
> where measured — leave blank (not zero) where not measured, and say so.

- **Date / time (UTC):**
- **Target env & project ref:** (must be non-prod)
- **Mocked?** AI_TEST_MODE = ___ ; MERIT_SYSTEM_ENABLED = ___
- **Profile:** ramp | spike | soak | recovery
- **Rung / dimension:** e.g. TARGET=25 executing analyses
- **Stage duration:**
- **k6 exit code:** (non-zero = threshold breach = STOP)

## Throughput / outcomes

| Metric | Value |
|---|---|
| Accepted requests | |
| Accepted runs | |
| Completed runs | |
| Failed runs | |
| Auto-recovered runs | |
| First-click completion rate | |
| Requests/second (achieved) | |

## Latency (from k6 `http_req_duration` + custom trends)

| Metric | p50 | p95 | p99 |
|---|---|---|---|
| HTTP request duration | | | |
| Analysis completion time | | | |
| Poll latency | | | |
| DB latency | | | |

## Queue / workers / infra (from measure-supabase.jsonl)

| Metric | Value |
|---|---|
| Queue depth (peak) | |
| Queue wait time | |
| Stuck runs | |
| DB latency (server) | |
| DB connections in use / max | |
| Edge Function concurrency (approx) | |
| Edge Function timeouts | |
| Storage/upload throughput | |
| Realtime connection count | |
| Polling volume (reqs) | |
| Worker utilization | |
| Memory usage (if available) | |
| Provider rate-limit hits (429) | |

## Safety invariants (MUST all be zero / clean)

| Invariant | Result |
|---|---|
| Duplicate analysis jobs | |
| Duplicate merit charges | |
| Merit inconsistencies (settled&refunded / false-refund / drift) | |
| Lost accepted runs | |
| Stuck runs at end of window | |
| Raw technical error surfaced to user | |

## Cost

| Metric | Value |
|---|---|
| Estimated infra cost (this stage) | |
| Estimated AI-provider cost (this stage) | |
| Cumulative real-provider spend vs $5 cap | |

## Decision

- **First observable bottleneck (if any):**
- **Degradation observed?** (what slowed/failed first)
- **Safe to advance to next rung?** yes / no — why:
- **Changes required before next level:**
