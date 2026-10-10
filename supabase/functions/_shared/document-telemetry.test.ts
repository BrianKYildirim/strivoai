import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  normalizeDocumentPageCount,
  recordDocumentProcessingRun,
  type DocumentTelemetryParent,
  type DocumentTelemetryStore,
} from './document-telemetry.ts';

const parent: DocumentTelemetryParent = {
  featureRunId: '11111111-1111-1111-1111-111111111111',
  costingSubjectId: '22222222-2222-2222-2222-222222222222',
  requestId: 'req-1',
  userId: '33333333-3333-3333-3333-333333333333',
  feature: 'resume_analysis',
  tierAtTime: 'elite',
  environment: 'test',
  excludeFromCostingAtTime: true,
};

function store() {
  const rows = new Map<string, Record<string, unknown>>();
  let inserts = 0;
  const value: DocumentTelemetryStore = {
    find: async (featureRunId, ordinal) => {
      const row = rows.get(`${featureRunId}:${ordinal}`);
      return row ? { id: row.id as string } : null;
    },
    insert: async (row) => {
      inserts++;
      rows.set(`${row.feature_run_id}:${row.document_ordinal}`, { ...row });
      return { id: row.id as string };
    },
    update: async (id, patch) => {
      for (const [key, row] of rows) {
        if (row.id === id) {
          rows.set(key, { ...row, ...patch });
          return true;
        }
      }
      return false;
    },
    resolvePagePricing: async (provider, sku) =>
      provider === 'mistral' && sku === 'mistral-ocr-4-0'
        ? { id: '44444444-4444-4444-4444-444444444444', pagesPer1000Usd: 4 }
        : null,
  };
  return { value, rows, inserts: () => inserts };
}

Deno.test('document telemetry inherits trusted parent and records parser-only verified zero', async () => {
  const fake = store();
  const result = await recordDocumentProcessingRun({
    parent,
    documentOrdinal: 1,
    fileType: 'pdf',
    pageCount: 0,
    fileSizeBytes: 1024,
    initialExtractor: 'pdf_parser',
    finalExtractor: 'pdf_parser',
    extractionStatus: 'completed',
    extractedCharacterCount: 900,
    extractionDurationMs: 15,
    ocrTriggered: false,
  }, { store: fake.value, randomUuid: () => 'doc-1', now: () => '2026-08-01T12:00:00Z' });

  assert(result.ok);
  const row = [...fake.rows.values()][0];
  assertEquals(row.feature_run_id, parent.featureRunId);
  assertEquals(row.costing_subject_id, parent.costingSubjectId);
  assertEquals(row.environment, 'test');
  assertEquals(row.exclude_from_costing_at_time, true);
  assertEquals(row.page_count, null, 'pageCount=0 unavailable sentinel must become NULL');
  assertEquals(row.ocr_triggered, false);
  assertEquals(row.ocr_attempt_count, 0);
  assertEquals(row.ocr_status, 'not_triggered');
  assertEquals(row.incurred_cost_usd, 0);
  assertEquals(row.cost_confidence, 'verified_zero');
});

Deno.test('one document row is idempotently updated with Mistral reported and calculated variance', async () => {
  const fake = store();
  const deps = { store: fake.value, randomUuid: () => 'doc-1', now: () => '2026-08-01T12:00:00Z' };
  await recordDocumentProcessingRun({
    parent,
    documentOrdinal: 1,
    fileType: 'pdf',
    pageCount: 2,
    initialExtractor: 'pdf_parser',
  }, deps);
  const result = await recordDocumentProcessingRun({
    parent,
    documentOrdinal: 1,
    fileType: 'pdf',
    pageCount: 2,
    initialExtractor: 'pdf_parser',
    finalExtractor: 'mistral',
    extractionStatus: 'completed',
    extractedCharacterCount: 1200,
    ocrTriggered: true,
    ocrTriggerReason: 'insufficient_text',
    ocrProvider: 'mistral',
    ocrModel: 'mistral-ocr-4-0',
    ocrPages: 2,
    ocrAttemptCount: 1,
    ocrStatus: 'completed',
    providerRequestId: 'mistral-request',
    providerReportedCostUsd: 0.009,
  }, deps);

  assert(result.ok && result.recovered);
  assertEquals(fake.inserts(), 1);
  const row = [...fake.rows.values()][0];
  assertEquals(row.provider_reported_cost_usd, 0.009);
  assertEquals(row.calculated_cost_usd, 0.008);
  assertEquals(row.incurred_cost_usd, 0.009);
  assert(Math.abs((row.cost_variance_usd as number) - 0.001) < 1e-12);
  assertEquals(row.pricing_id, '44444444-4444-4444-4444-444444444444');
  assertEquals(row.cost_known, true);
  assertEquals(row.cost_confidence, 'reported');
});

Deno.test('configured provider failure without usage remains unknown rather than zero', async () => {
  const fake = store();
  await recordDocumentProcessingRun({
    parent,
    documentOrdinal: 1,
    fileType: 'pdf',
    initialExtractor: 'pdf_parser',
    finalExtractor: 'none',
    extractionStatus: 'failed',
    ocrTriggered: true,
    ocrTriggerReason: 'parser_error',
    ocrProvider: 'textract',
    ocrAttemptCount: 1,
    ocrStatus: 'failed',
    errorCode: 'textract_http_503',
    errorCategory: 'provider',
  }, { store: fake.value, randomUuid: () => 'doc-1' });
  const row = [...fake.rows.values()][0];
  assertEquals(row.ocr_pages, null);
  assertEquals(row.incurred_cost_usd, null);
  assertEquals(row.cost_known, false);
  assertEquals(row.cost_confidence, 'unknown');
});

Deno.test('accepted DOCX reuse is a no-OCR verified-zero route', async () => {
  const fake = store();
  await recordDocumentProcessingRun({
    parent,
    documentOrdinal: 2,
    fileType: 'docx',
    pageCount: null,
    initialExtractor: 'accepted_extraction',
    finalExtractor: 'accepted_extraction',
    extractionStatus: 'completed',
    extractedCharacterCount: 700,
    ocrTriggered: false,
  }, { store: fake.value, randomUuid: () => 'doc-2' });
  const row = [...fake.rows.values()][0];
  assertEquals(row.file_type, 'docx');
  assertEquals(row.page_count, null);
  assertEquals(row.cost_confidence, 'verified_zero');
});

Deno.test('Claude-linked document row references AI cost and owns no duplicate cost', async () => {
  const fake = store();
  await recordDocumentProcessingRun({
    parent,
    documentOrdinal: 1,
    fileType: 'pdf',
    initialExtractor: 'pdf_parser',
    finalExtractor: 'claude_ocr',
    extractionStatus: 'completed',
    ocrTriggered: true,
    ocrTriggerReason: 'scanned_document',
    ocrProvider: 'anthropic',
    ocrPages: 1,
    ocrAttemptCount: 1,
    ocrStatus: 'completed',
    aiCallTelemetryId: 42,
  }, { store: fake.value, randomUuid: () => 'doc-1' });
  const row = [...fake.rows.values()][0];
  assertEquals(row.ai_call_telemetry_id, 42);
  assertEquals(row.provider_reported_cost_usd, null);
  assertEquals(row.calculated_cost_usd, null);
  assertEquals(row.incurred_cost_usd, null);
  assertEquals(row.cost_confidence, 'referenced_ai');
});

Deno.test('document writer allowlist cannot persist content, filename, hashes, prompts, or secrets', async () => {
  const fake = store();
  await recordDocumentProcessingRun({
    parent,
    documentOrdinal: 1,
    fileType: 'pdf',
    initialExtractor: 'unknown',
  }, { store: fake.value, randomUuid: () => 'doc-1' });
  const serialized = JSON.stringify([...fake.rows.values()][0]);
  for (const forbidden of ['filename', 'document_hash', 'raw_text', 'image', 'prompt', 'response', 'email', 'secret']) {
    assert(!serialized.includes(forbidden), forbidden);
  }
});

Deno.test('document telemetry never throws when persistence is unavailable', async () => {
  const broken = store().value;
  broken.find = () => Promise.reject(new Error('database unavailable'));
  const result = await recordDocumentProcessingRun({
    parent,
    documentOrdinal: 1,
    fileType: 'pdf',
    initialExtractor: 'unknown',
  }, { store: broken });
  assertEquals(result, { ok: false, reason: 'document_telemetry_unavailable' });
});

Deno.test('page normalization reserves zero for explicit provider evidence only', () => {
  assertEquals(normalizeDocumentPageCount(0), null);
  assertEquals(normalizeDocumentPageCount(null), null);
  assertEquals(normalizeDocumentPageCount(2), 2);
});
