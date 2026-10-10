# Phase 3: Cross-Device Reliability and Compatibility - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-27
**Phase:** 3-cross-device-reliability-and-compatibility
**Areas discussed:** Device coverage & what counts as proof, Supported-browser policy & gate
placement, Diagnostics scope & destination, One-click integrity, Stale-bundle recovery,
Timeout & wait experience, Audit method & triage, Verification & rollout

---

## Device coverage & what counts as proof

### Playwright projects

| Option | Description | Selected |
|--------|-------------|----------|
| All 3 engines + emulated mobile | chromium/firefox/webkit + emulated iPhone (WebKit) + Pixel (Chromium) | ✓ |
| 3 engines, desktop only | Engine differences but no touch/mobile viewport coverage | |
| Chromium + WebKit only | Cheapest step up; leaves Firefox unautomated | |

**User's choice:** All 3 engines + emulated mobile.

### Real-device strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Manual scripted pass on Mac + Windows | No new infra; manual, won't run per-PR | |
| Cloud device farm in CI | Genuine iOS/Edge/Android; new paid infra | |
| Manual now, farm only if audit finds real gaps | Defers cost + constraint-break until evidence justifies it | ✓ |

**User's choice:** Manual now, farm only if the audit proves emulation-invisible gaps.
**Notes:** The farm is recorded as a deferred idea, not a rejected one.

### Previous-major-version coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Don't automate; feature-detection + manual | Support floor as a feature set; N-1 spot-checked manually | ✓ |
| Pin a second Playwright version in CI | Genuinely automated but drifts and doubles maintenance | |
| Use released channels | Real Chrome/Edge, but Chromium-family only | |

**User's choice:** Don't automate N-1.

### Proof bar for "supported"

| Option | Description | Selected |
|--------|-------------|----------|
| Engine pass + one real-device spot-check per family | Anything with only one is "partially verified" | ✓ |
| Engine pass sufficient | Fully automated but the matrix would overclaim | |
| Real-device required for every browser | Strictest; shrinks the matrix substantially | |

**User's choice:** Engine pass + real-device spot-check per family.

### Matrix cost vs verify:baseline runtime

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-device subset on all 5, full suite on chromium | Keeps the gate fast | ✓ |
| Full suite on all 5 | ~5x e2e wall-clock; risks `-SkipVerify` habit | |
| Full on all 5, CI only | Fast locally, but deploy.ps1 runs baseline locally | |

**User's choice:** Tagged subset on all 5; full suite chromium-only.

---

## Supported-browser policy & gate placement

| Question | Selected | Alternatives rejected |
|---|---|---|
| Support floor | Feature detection against a required-API set | UA version allowlist; both-blocking |
| Failure behavior | Tiered — marketing/auth allowed, AI + checkout blocked | Hard full-page block; warn-and-continue |
| Gate placement | Both — ES5-safe inline pre-bundle guard + styled in-app check | index.html only; React root only |
| Missing-API default | Polyfill when safely polyfillable; block only when not | Prefer blocking; always polyfill |

**Notes:** The feature-detection choice was argued from evidence — the 2026-07-26
`getOrInsertComputed` failure occurred in *current* browsers, so a version check would have
missed it entirely.

---

## Diagnostics: scope & destination

| Question | Selected | Alternatives rejected |
|---|---|---|
| Scope | Generalize to all 11 audit surfaces | 5 AI features only; resume + checkout only |
| Destination | Persist to Postgres via fire-and-forget edge function | Console-only; both sinks |
| Relation to Phase 2 | Separate table, distinct concern | Extend `ai_call_telemetry`; shared table + discriminator |
| Events recorded | Failures only, carrying stage | All transitions; failures + sampled successes |

**Notes:** The separate-table decision is partly a concurrency safeguard — Phase 02 is in flight
under separate ownership, and extending its migration would risk a conflict mid-phase.

---

## One-click integrity: audit vs rebuild

| Question | Selected | Alternatives rejected |
|---|---|---|
| Approach | Audit first; extract a primitive only where 2+ features need the same fix | Audit-and-close only; shared primitive up front |
| Enforcement layer | Both client submit-lock and server idempotency key | Server only; client only |
| Attempt keying | Reuse existing `deriveIdempotencyKey` / `inputIdentity` | Per-click nonce; server time-window dedupe |
| Proof | Extend `two-tab-concurrency` + `elite-rerun-merit` across the matrix | New per-feature specs; DB ledger assertions |

**Notes:** Keying must preserve paid Elite re-runs as genuinely new attempts.

---

## Stale-bundle recovery & timeout policy

| Question | Selected | Alternatives rejected |
|---|---|---|
| Stale detection | Both build stamp and chunk-load-failure catch | Passive only; active poll only |
| Reload UX | Silent single auto-reload, loop-guarded, route preserved | Toast prompt; full-page message |
| Timeout policy | A client timeout never means failure — poll until server-terminal | Raise the hard limit; device-adaptive timeouts |
| Wait UX | Honest stage-based status from the lifecycle | Generic spinner; estimated time remaining |

**Notes:** The build stamp is required by XLOG-01's app-version field regardless, which made
active version detection nearly free.

---

## Audit method, triage, verification & rollout

| Question | Selected | Alternatives rejected |
|---|---|---|
| Audit method | Matrix-first discovery, then targeted static sweep | Static-first; manual exploratory first |
| Triage | Only reproduced issues fixed; rest to a residual register | Also fix plausible static findings; production-reported only |
| Verification | Preview for all but real AI output; scheduled operator production pass | Production-only behind flags; new third environment |
| Rollout | Staged by ascending blast radius | Single flag with one flip; ship directly on green |

---

## Claude's Discretion

- Exact required-API set for feature detection, and the published version list.
- Diagnostics table name, columns, RLS posture, retention policy.
- Tag mechanism defining the cross-device subset, and which specs carry it.
- File layout for the generalized diagnostics seam and browser-support module.
- All user-facing copy wording (constrained by XRUN-06).
- Whether a shared submit-guard primitive is warranted (made evidence-driven by D-14).

## Deferred Ideas

- Cloud device farm (BrowserStack / Sauce / LambdaTest) — revisit as its own phase only if the
  audit proves gaps engine + emulation coverage structurally could not catch.
- A third environment with live Anthropic calls, to close the Preview `AI_TEST_MODE` gap.
