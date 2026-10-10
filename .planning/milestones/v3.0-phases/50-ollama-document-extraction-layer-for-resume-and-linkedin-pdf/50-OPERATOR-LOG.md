---
phase: 50-ollama-document-extraction-layer-for-resume-and-linkedin-pdf
status: human_needed
updated: 2026-06-06
owner: operator
purpose: Durable log for Phase 50 production Ollama setup, verification state, and external blockers.
---

# Phase 50 Operator Log

## Current Phase State

Phase 50 code execution is complete. `gsd-sdk query init.execute-phase 50` reported:

- `plan_count: 7`
- `incomplete_count: 0`
- summaries present for `50-01` through `50-07`

`50-VERIFICATION.md` is currently `status: human_needed`, not `passed`, because code verification is complete but production-like staging/runtime checks for Ollama still require a real reachable Ollama environment.

## Code Gap Closed

The prior verification gap was `GAP-50-01`: production LinkedIn PDF replacement paths persisted accepted text but did not persist `profiles.linkedin_pdf_text_hash` or `profiles.linkedin_pdf_extraction_metadata`.

Plan `50-07` closed that gap.

Updated source files:

- `src/lib/document-extraction.ts`
- `src/pages/LinkedInGrader.tsx`
- `src/pages/Profile.tsx`
- `src/pages/Onboarding.tsx`
- `src/pages/CareerCompass.tsx`
- `src/pages/__tests__/document-extraction-primary.test.ts`
- `src/pages/__tests__/document-extraction-secondary.test.ts`

The implementation added `serializeDocumentExtractionMetadata()` and now carries accepted extraction metadata into LinkedIn PDF replacement writes when metadata is available.

Important behavior preserved:

- LinkedInGrader still persists replacement PDF content only after `grade-linkedin` succeeds.
- Profile, Onboarding, and CareerCompass keep authenticated profile update filters.
- Saved or legacy LinkedIn fallback content is not assigned fabricated metadata.
- Provider metadata remains hidden from normal UI.
- No historical backfill was added.

## Verification Already Run

Focused checks completed:

- `npm.cmd run test -- --run src/pages/__tests__/document-extraction-primary.test.ts src/pages/__tests__/document-extraction-secondary.test.ts`
  - Result: PASS
  - 2 files, 10 tests
- `npm.cmd run build -- --outDir dist-codex --emptyOutDir=true`
  - Result: PASS
- Provider UI search:
  - `rg -n "ollama|claude_ocr|attemptedProviders|provider used" src/pages/LinkedInGrader.tsx src/pages/Profile.tsx src/pages/Onboarding.tsx src/pages/CareerCompass.tsx`
  - Result: PASS by no matches

Known verification limitation:

- `npm.cmd run type-check -- --pretty false` is blocked before edited files are checked by existing `tsconfig.app.json` error `TS5103: Invalid value for '--ignoreDeprecations'`.

Windows sandbox note:

- Several non-escalated shell, `npm.cmd`, and `rg` commands failed before project execution with exit code `-1073741502`.
- The same focused commands passed when rerun with escalation.

## Human UAT Still Pending

Remaining human/runtime checks are recorded in `50-HUMAN-UAT.md`.

Pending checks:

1. `OLLAMA_BASE_URL` unset:
   - Expected: scanned resume and LinkedIn PDFs still succeed through Claude fallback with no Ollama-specific user-facing error.

2. Healthy Ollama:
   - Expected: scanned resume and LinkedIn PDFs can be accepted with `provider: ollama`, attempted providers, hash, and concise metadata persisted.

3. Unhealthy or wrong-model Ollama:
   - Expected: fallback to Claude works; if all providers fail, the user receives a specific extraction error and no empty text is persisted.

## Ollama Runtime Configuration Expected By Code

Do not configure frontend `.env` files for Ollama. The frontend intentionally does not know the Ollama host, model, provider order, or auth details.

The backend reads Supabase Edge Function secrets:

- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OLLAMA_TIMEOUT_MS`
- `OLLAMA_AUTH_HEADER_NAME`
- `OLLAMA_AUTH_SECRET`

Defaults in `supabase/functions/_shared/ollama-client.ts`:

- `OLLAMA_MODEL` defaults to `gemma3:4b`
- `OLLAMA_TIMEOUT_MS` defaults to `35000`
- timeout is capped at `60000`

The code calls:

- `${OLLAMA_BASE_URL}/api/chat`
- method `POST`
- body uses `stream: false`
- image payloads are sent in the message `images` array

## Production Server Recommendation

Recommended production host:

- AWS EC2 `g6.xlarge`
- Ubuntu 22.04 or AWS Deep Learning AMI GPU Ubuntu 22.04
- NVIDIA L4 GPU
- 100 GiB gp3 root disk
- expose only ports `22`, `80`, and `443`
- do not expose Ollama port `11434`
- run Ollama locally on the instance
- place Caddy or another HTTPS reverse proxy in front of Ollama
- require a bearer token header at the proxy

Security group plan:

- SSH port `22`: source should be operator IP only
- HTTP port `80`: open for certificate issuance / redirect
- HTTPS port `443`: open publicly
- MSSQL: disabled
- Ollama port `11434`: not exposed

Example production DNS:

- `ollama.strivoai.net -> Elastic IP`

Example Supabase production secrets after proxy is live:

```bash
supabase secrets set OLLAMA_BASE_URL="https://ollama.strivoai.net" --project-ref <prod-ref>
supabase secrets set OLLAMA_MODEL="gemma3:4b" --project-ref <prod-ref>
supabase secrets set OLLAMA_TIMEOUT_MS="35000" --project-ref <prod-ref>
supabase secrets set OLLAMA_AUTH_HEADER_NAME="Authorization" --project-ref <prod-ref>
supabase secrets set OLLAMA_AUTH_SECRET="Bearer <long-random-secret>" --project-ref <prod-ref>
```

Relevant functions to deploy/redeploy after secrets are configured:

```bash
supabase functions deploy ocr-pdf --project-ref <prod-ref>
supabase functions deploy analyze-career --project-ref <prod-ref>
supabase functions deploy interview-prep-analyze --project-ref <prod-ref>
```

## AWS Quota Blocker

Attempted EC2 creation for GPU instance failed with:

```text
Instance launch failed. You have requested more vCPU capacity than your current vCPU limit of 0 allows for the instance bucket that the specified instance type belongs to.
```

Interpretation:

- The AWS account currently has zero quota for the GPU instance quota bucket in that region.
- The relevant quota is `Running On-Demand G and VT instances`.
- The quota is regional.
- `g6.xlarge` requires GPU-family On-Demand vCPU quota.

Initial AWS quota request was submitted without additional detail and denied.

AWS response:

```text
Hello,

I am sorry but at this time we are unable to approve your service quota increase request.

Service quotas are put in place to help you gradually ramp up activity and decrease the likelihood of large bills due to sudden, unexpected spikes.

If you'd like to appeal this decision, please reopen this case and provide as detailed a use case as possible. With this additional information, we would be more than happy to re-assess this request.

Best regards,
Amazon Web Services.
```

Appeal response drafted for AWS:

```text
Hello AWS Support,

I’d like to appeal this quota decision. I’m requesting a small increase for Running On-Demand G and VT instances so I can run a single g6.xlarge production GPU instance for Strivo AI, a career intelligence web application that helps users analyze resumes and LinkedIn profile PDFs. The instance will run Ollama for document OCR/extraction as a backend-only service used by Supabase Edge Functions. It is not for crypto mining, resale, scraping, batch training, or public GPU access. The service will process user-uploaded career documents to extract raw text, then fall back to our existing Anthropic/Claude OCR path if Ollama is unavailable.

The deployment is intentionally limited and cost-controlled: I only need enough quota for one production g6.xlarge instance, with a requested quota of 4 to 8 vCPUs in this region. Ollama will run behind an HTTPS reverse proxy with bearer-token authentication; the raw Ollama port will not be publicly exposed. Usage is request-driven from authenticated application users, with application-level rate limits and subscription limits already in place. This GPU instance is needed to reduce OCR cost and latency while preserving reliability for resume and LinkedIn PDF extraction.
```

## Recommended Next Actions

1. Reopen the AWS quota case and submit the appeal text above.
2. Request `4` vCPUs minimum or `8` vCPUs preferred for `Running On-Demand G and VT instances` in the intended production region.
3. If AWS approves:
   - launch `g6.xlarge`
   - attach Elastic IP
   - point `ollama.strivoai.net` to Elastic IP
   - install Ollama
   - pull `gemma3:4b`
   - configure Caddy HTTPS reverse proxy with bearer auth
   - set Supabase production secrets
   - redeploy the relevant Supabase functions
   - run `50-HUMAN-UAT.md`
4. If AWS denies again:
   - use RunPod or another managed GPU host temporarily for staging/prod Ollama
   - keep the same external HTTPS + bearer-auth contract
   - set `OLLAMA_BASE_URL` to that reachable authenticated endpoint
5. Do not mark Phase 50 `passed` until `50-HUMAN-UAT.md` has results recorded.

## Current Caution

Production can continue without Ollama configured because the code falls back when `OLLAMA_BASE_URL` is missing. That means the phase is safe to leave in `human_needed` while AWS quota is resolved, but the Ollama cost-control path is not live until a reachable host and Supabase secrets are configured.
