# Production Cutover -- 2026-04-29T00:55:51Z

Project ref: zjpjapgraoxdukdvpjes
Operator: <name>
Pre-flip state: <from C:\Projects\strive-ai-hired\.planning\phases\21-integration-validation-and-cutover\21-CUTOVER-LOG.md>
Post-flip state: MERIT_SYSTEM_ENABLED=true

## Pre-Flip Checklist (D-09)
(Copy the completed checkbox block from 21-CUTOVER-LOG.md)

## Boot-Time Attestations (D-19)
One row per D-07 gated handler -- captured from production logs within 5 minutes of flip.

| Handler | merit-flag observed | enabled value | Cold-start log timestamp |
|---------|---------------------|---------------|--------------------------|
| analyze-resume | ? | ? | ? |
| analyze-career | ? | ? | ? |
| grade-linkedin | ? | ? | ? |
| recruiting-lens | ? | ? | ? |
| analyze-skills-gap | ? | ? | ? |
| compare-jobs | ? | ? | ? |
| interview-prep-analyze | ? | ? | ? |
| submit-resume-analysis-job | ? | ? | ? |
| submit-career-analysis-job | ? | ? | ? |

### OQ1: Intentionally Ungated
- `interview-prep-evaluate` -- NOT listed above. Per Phase 13 D-07 design and the NOTE at ~line 14 of its source, this handler does NOT deduct merits (deduction occurs at quiz-start via the evaluate's caller). Absence of a merit-flag line for this handler is EXPECTED, not a failure.
- `interview-prep-coach` -- NOT listed above. The function does not exist in this repo as of commit dcf7b20; it was removed from the cutover script's redeploy list and the probe table.

## Synthetic Probe Runs (D-18)
T=0h probe: (populated by D3-Soak0)
T=1h probe: (populated by D3-Soak1)
T=2h probe: (populated by D3-Soak2)

## Organic Merit-Transaction Samples (D-11)
Captured from genuine production traffic (NOT from sc5-probe.ps1). Minimum one required.

(populated by D3-Soak1)

## Alert State (per probe checkpoint)
- T=0h: <row count, any active sev>
- T=1h: <...>
- T=2h: <...>

## Rollback Criteria
Rollback is MANDATORY if any of the following occur during the 2h active soak:
- Any sc5-probe.ps1 run exits non-zero
- Any merit-transaction log with ok:false where the reason is not a known gating code (insufficient_merits, flag_disabled, rate_limited)
- Any sev-1 alert in alert_state touching merit-* paths
- Any 5xx rate spike on a D-07 gated handler exceeding staging baseline by 3x

Rollback command: `Invoke-MeritFlagRollback -ProjectRef zjpjapgraoxdukdvpjes`

## Outcome
(Filled at T=2h+ in Gate D4-Finalize)

Status: <HOLD | ROLLBACK>
Summary: <...>
