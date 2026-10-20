# Strivo capacity & load-test — FINAL REPORT

> Part 4 skeleton. Fill ONLY with measured evidence. Stop at the first unsafe level;
> do not extrapolate. **Do not claim million-user readiness.** Report only capacity
> supported by measurements.

## Execution status

- [ ] **NOT YET EXECUTED.** This report is a template. The harness (Part 1) is built and
      committed; Parts 2–3 execution was deferred (operator chose build-only, no traffic).
      No stage has been run; every number below is blank until a human-gated run fills it.

## 1. Environment tested
-

## 2. What was mocked
- (AI provider via `AI_TEST_MODE`? merit ledger state? fault injectors?)

## 3. What was tested against real services
- (Supabase Postgres/Storage/Realtime/Edge — real. Anthropic — mocked except the
  $5-capped sample, if run.)

## 4–7. Highest VERIFIED-SAFE levels (measured, not aspirational)

| Dimension | Highest verified-safe | Evidence (stage / file) |
|---|---|---|
| Concurrent browsing sessions | | |
| Concurrent uploads | | |
| Queued analyses | | |
| Executing analyses | | |

## 8. Requests/second at each stage
| Stage | Dimension | Rung | RPS |
|---|---|---|---|
| | | | |

## 9. Latency at each stage
| Stage | Rung | p50 | p95 | p99 |
|---|---|---|---|---|
| | | | | |

## 10. First-click completion rate at each stage
| Stage | Rung | First-click completion |
|---|---|---|
| | | |

## 11. Exact stage where degradation began
-

## 12. First bottleneck
-

## 13. What failed or slowed first
-

## 14. Was overload handled gracefully?
- Queued instead of lost? Duplicate-submission prevented? Merit accounting correct?
- Raw errors withheld from users?

## 15. Did the system recover after traffic fell?
- Queue drained? Connections released? Latency returned to baseline? Any stuck runs?

## 16. Duplicate-job & duplicate-charge results
- (from `tools/measure-supabase.mjs` invariant queries)

## 17. Estimated cost at each meaningful load level
| Load level | Infra $ | Provider $ |
|---|---|---|
| | | |

## 18. Changes required before testing the next level
-

## 19. Exact commands to reproduce
- (copy the exact `tools/run-stage.mjs` / `k6 run` invocations used)

## 20. Commit hashes
- Harness: `<hash>`
- Any instrumentation fixes made during execution: `<hash(es)>`

## 21. Production confirmation
- [ ] **Production was NOT modified and NOT load-tested.** Production ref
      `zjpjapgraoxdukdvpjes` is blocklisted in `config/environments.js`,
      `tools/measure-supabase.mjs`, `fixtures/generate-fixtures.mjs`, and
      `tools/cleanup.mjs`; all traffic targeted a non-prod project.
