import { assert, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("ocr-pdf resolves raw subscription_tier for Claude OCR policy", () => {
  assert(
    source.includes(".select('subscription_tier')"),
    "ocr-pdf must read the raw profile subscription_tier for OCR policy",
  );
  assert(
    source.includes("const rawTier = await resolveRawSubscriptionTier(userContextOcr.userId);"),
    "ocr-pdf must resolve raw tier after auth instead of trusting normalized auth tier",
  );
  assert(
    source.includes("tier: rawTier"),
    "ocr-pdf must pass the raw tier into the extraction policy",
  );
  assert(
    source.includes("allowClaudeOcr: rawTier === 'elite'"),
    "Claude OCR must be enabled only for a literal elite raw tier",
  );
});

Deno.test("ocr-pdf reuse short-circuit persists the accepted extraction to the new resumes row before returning", () => {
  // 2026-07-24 prod incident: re-uploading identical bytes minted a new resumes row with
  // empty extracted_text because the reuse hit returned early without persisting. The
  // backend PDF parser is a deliberate no-op (pdf-parser.ts, Phase 51), so Career Compass
  // then 400'd (INPUT_MISSING) on every attempt for that row. The reuse branch MUST copy
  // the reused extraction onto the provided resumeId before the early return.
  const reuseBlock = source.match(
    /if \(reuse\.ok && reuse\.found\) \{([\s\S]*?)\}\s*if \(!reuse\.ok\)/,
  );
  assert(reuseBlock, "could not locate the reuse short-circuit block");
  assert(
    reuseBlock![1].includes("persistAcceptedExtraction"),
    "reuse short-circuit must persist the reused extraction to the new resumes row",
  );
  assert(
    reuseBlock![1].includes("result: reuse.result"),
    "reuse persist must write the REUSED accepted extraction (reuse.result), not a fresh one",
  );
  assert(
    reuseBlock![1].indexOf("persistAcceptedExtraction") < reuseBlock![1].indexOf("text: reuse.result.text"),
    "persist must happen BEFORE the early-return response",
  );
});

Deno.test("ocr-pdf does not derive Claude OCR policy from normalized auth tier", () => {
  assert(
    !source.includes("allowClaudeOcr: userContextOcr.tier === 'elite'"),
    "ocr-pdf must not use requireAuth's normalized tier for Claude OCR policy",
  );
  assertMatch(
    source,
    /const extractionPolicy: ExtractionPolicy = \{\s+userId: userContextOcr\.userId,\s+tier: rawTier,\s+allowClaudeOcr: rawTier === 'elite'/s,
  );
});

Deno.test("ocr-pdf resolves a caller-owned pending correlation before paid work", () => {
  const authIndex = source.indexOf("await requireAuth(req, { type: 'user' })");
  const resolveIndex = source.indexOf('await resolveTrackedFeatureRun(featureRunToken, userContextOcr.userId)');
  const rateLimitIndex = source.indexOf('await checkRateLimit(userContextOcr.userId');
  const extractionIndex = source.indexOf('await extractDocumentText({');

  assert(authIndex >= 0, 'user auth must be present');
  assert(resolveIndex > authIndex, 'the opaque token must be resolved after caller auth');
  assert(rateLimitIndex > resolveIndex, 'invalid correlation must fail before consuming rate-limit capacity');
  assert(extractionIndex > rateLimitIndex, 'invalid correlation must fail before provider extraction');
  for (const requiredSnapshot of [
    ".eq('user_id', userId)",
    "data.status !== 'started'",
    'data.feature !== token.feature',
    'data.run_variant !== token.runVariant',
    'data.input_type !== token.inputType',
    'data.document_count !== token.documentCount',
  ]) {
    assert(source.includes(requiredSnapshot), `missing correlation guard: ${requiredSnapshot}`);
  }
});

Deno.test("ocr-pdf rejects browser costing authority before provider work", () => {
  const rejectionIndex = source.indexOf('FORBIDDEN_COSTING_FIELDS.has(key)');
  const providerIndex = source.indexOf('await extractDocumentText({');
  assert(rejectionIndex >= 0 && rejectionIndex < providerIndex);
  for (const forbidden of [
    'featureRunId', 'userId', 'tier', 'environment', 'excludeFromCosting',
    'pageCost', 'providerResult', 'attemptCount', 'model', 'reportedCostUsd',
  ]) {
    assert(source.includes(`'${forbidden}'`), `browser field must be rejected: ${forbidden}`);
  }
});

Deno.test("ocr-pdf records parser, reuse, OCR success, and failure on one document route", () => {
  assert(source.includes('recordDocumentProcessingRun({'));
  assert(source.includes("initialExtractor: 'accepted_extraction'"));
  assert(source.includes("initialExtractor: 'pdf_parser'"));
  assert(source.includes("ocrTriggered: false"), 'parser and accepted reuse must record no OCR');
  assert(source.includes('ocrTriggerReason: ocrTriggered ? triggerReason(extraction.attempts) : null'));
  assert(source.includes("extractionStatus: 'completed'"));
  assert(source.includes("extractionStatus: 'failed'"));
  assert(source.includes('providerRequestId: evidence?.providerRequestId ?? null'));
});

Deno.test("Claude page telemetry is monotonic and the document only references its owning AI row", () => {
  assert(source.includes("operationName: 'document_ocr'"));
  assert(source.includes('featureRunId: context.parent.featureRunId'));
  assert(source.includes('attemptNumber: attemptCount'));
  assert(source.includes('isRetry: false'));
  assert(source.includes('if (typeof ai.telemetryId === \'number\') telemetryIds.push(ai.telemetryId)'));
  assert(source.includes('aiCallTelemetryId: extraction.metadata.provider === \'claude_ocr\''));
  assert(
    !source.includes('providerReportedCostUsd: extraction.metadata.provider === \'claude_ocr\''),
    'the linked document row must not own a duplicate Claude cost',
  );
});
