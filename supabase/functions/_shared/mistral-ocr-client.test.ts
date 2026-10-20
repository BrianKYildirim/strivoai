import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invokeMistralOcr } from "./mistral-ocr-client.ts";

async function withMistralEnv(fn: () => Promise<void>): Promise<void> {
  const originalKey = Deno.env.get('MISTRAL_OCR_API_KEY');
  const originalModel = Deno.env.get('MISTRAL_OCR_MODEL');
  const originalFetch = globalThis.fetch;
  Deno.env.set('MISTRAL_OCR_API_KEY', 'test-key');
  Deno.env.set('MISTRAL_OCR_MODEL', 'mistral-ocr-4-0');
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey) Deno.env.set('MISTRAL_OCR_API_KEY', originalKey);
    else Deno.env.delete('MISTRAL_OCR_API_KEY');
    if (originalModel) Deno.env.set('MISTRAL_OCR_MODEL', originalModel);
    else Deno.env.delete('MISTRAL_OCR_MODEL');
  }
}

Deno.test("invokeMistralOcr skips when API key is not configured", async () => {
  const original = Deno.env.get("MISTRAL_OCR_API_KEY");
  try {
    Deno.env.delete("MISTRAL_OCR_API_KEY");
    const result = await invokeMistralOcr({ documentType: "resume", images: ["page"] });
    assertEquals(result, { ok: false, reason: "mistral_config_missing" });
  } finally {
    if (original) Deno.env.set("MISTRAL_OCR_API_KEY", original);
  }
});

Deno.test("invokeMistralOcr skips empty image input without network calls", async () => {
  const original = Deno.env.get("MISTRAL_OCR_API_KEY");
  try {
    Deno.env.set("MISTRAL_OCR_API_KEY", "test-key");
    const result = await invokeMistralOcr({ documentType: "resume", images: [] });
    assertEquals(result, { ok: false, reason: "mistral_no_images" });
  } finally {
    if (original) Deno.env.set("MISTRAL_OCR_API_KEY", original);
    else Deno.env.delete("MISTRAL_OCR_API_KEY");
  }
});

Deno.test('invokeMistralOcr preserves attributable page, request, model, and reported cost evidence', async () => {
  await withMistralEnv(async () => {
    globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
      text: 'extracted text',
      model: 'mistral-ocr-4-0',
      usage_info: { pages_processed: 2, cost_usd: 0.008 },
    }), { status: 200, headers: { 'request-id': 'mistral-request-1' } }))) as typeof fetch;
    const result = await invokeMistralOcr({ documentType: 'resume', images: ['one', 'two'] });
    assertEquals(result.ok, true);
    if (!result.ok) throw new Error('expected success');
    assertEquals(result.text, 'extracted text');
    assertEquals(result.evidence.modelOrApi, 'mistral-ocr-4-0');
    assertEquals(result.evidence.providerRequestId, 'mistral-request-1');
    assertEquals(result.evidence.billablePages, 2);
    assertEquals(result.evidence.reportedCostUsd, 0.008);
    assertEquals(result.evidence.attemptCount, 1);
  });
});

Deno.test('invokeMistralOcr keeps failed/no-usage cost and pages unknown', async () => {
  await withMistralEnv(async () => {
    globalThis.fetch = (() => Promise.resolve(new Response('unavailable', {
      status: 503,
      headers: { 'x-request-id': 'mistral-request-2' },
    }))) as typeof fetch;
    const result = await invokeMistralOcr({ documentType: 'resume', images: ['one'] });
    assertEquals(result.ok, false);
    if (result.ok) throw new Error('expected failure');
    assertEquals(result.reason, 'mistral_http_503');
    assertEquals(result.evidence?.providerRequestId, 'mistral-request-2');
    assertEquals(result.evidence?.billablePages, null);
    assertEquals(result.evidence?.reportedCostUsd, null);
  });
});
