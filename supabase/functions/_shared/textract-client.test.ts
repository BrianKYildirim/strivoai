import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { invokeTextractOcr } from "./textract-client.ts";

async function withTextractEnv(fn: () => Promise<void>): Promise<void> {
  const originalEndpoint = Deno.env.get('TEXTRACT_OCR_ENDPOINT');
  const originalToken = Deno.env.get('TEXTRACT_OCR_TOKEN');
  const originalFetch = globalThis.fetch;
  Deno.env.set('TEXTRACT_OCR_ENDPOINT', 'https://example.invalid/textract');
  Deno.env.set('TEXTRACT_OCR_TOKEN', 'test-token');
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEndpoint) Deno.env.set('TEXTRACT_OCR_ENDPOINT', originalEndpoint);
    else Deno.env.delete('TEXTRACT_OCR_ENDPOINT');
    if (originalToken) Deno.env.set('TEXTRACT_OCR_TOKEN', originalToken);
    else Deno.env.delete('TEXTRACT_OCR_TOKEN');
  }
}

Deno.test("invokeTextractOcr skips when endpoint or token is not configured", async () => {
  const originalEndpoint = Deno.env.get("TEXTRACT_OCR_ENDPOINT");
  const originalToken = Deno.env.get("TEXTRACT_OCR_TOKEN");
  try {
    Deno.env.delete("TEXTRACT_OCR_ENDPOINT");
    Deno.env.delete("TEXTRACT_OCR_TOKEN");
    const result = await invokeTextractOcr({ documentType: "resume", images: ["page"] });
    assertEquals(result, { ok: false, reason: "textract_config_missing" });
  } finally {
    if (originalEndpoint) Deno.env.set("TEXTRACT_OCR_ENDPOINT", originalEndpoint);
    if (originalToken) Deno.env.set("TEXTRACT_OCR_TOKEN", originalToken);
  }
});

Deno.test("invokeTextractOcr skips empty image input without network calls", async () => {
  const originalEndpoint = Deno.env.get("TEXTRACT_OCR_ENDPOINT");
  const originalToken = Deno.env.get("TEXTRACT_OCR_TOKEN");
  try {
    Deno.env.set("TEXTRACT_OCR_ENDPOINT", "https://example.invalid/textract");
    Deno.env.set("TEXTRACT_OCR_TOKEN", "test-token");
    const result = await invokeTextractOcr({ documentType: "resume", images: [] });
    assertEquals(result, { ok: false, reason: "textract_no_images" });
  } finally {
    if (originalEndpoint) Deno.env.set("TEXTRACT_OCR_ENDPOINT", originalEndpoint);
    else Deno.env.delete("TEXTRACT_OCR_ENDPOINT");
    if (originalToken) Deno.env.set("TEXTRACT_OCR_TOKEN", originalToken);
    else Deno.env.delete("TEXTRACT_OCR_TOKEN");
  }
});

Deno.test('invokeTextractOcr preserves safe provider metadata but keeps compatible-endpoint cost unknown', async () => {
  await withTextractEnv(async () => {
    globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({
      text: 'extracted text',
      operation: 'DetectDocumentText',
      region: 'us-west-2',
      request_id: 'textract-request-1',
      pages_processed: 2,
      cost_usd: 99,
    }), { status: 200 }))) as typeof fetch;
    const result = await invokeTextractOcr({ documentType: 'resume', images: ['one', 'two'] });
    assertEquals(result.ok, true);
    if (!result.ok) throw new Error('expected success');
    assertEquals(result.evidence.modelOrApi, 'DetectDocumentText');
    assertEquals(result.evidence.region, 'us-west-2');
    assertEquals(result.evidence.providerRequestId, 'textract-request-1');
    assertEquals(result.evidence.billablePages, 2);
    assertEquals(result.evidence.reportedCostUsd, null);
  });
});

Deno.test('invokeTextractOcr keeps failed/no-usage evidence unknown', async () => {
  await withTextractEnv(async () => {
    globalThis.fetch = (() => Promise.resolve(new Response('timeout', {
      status: 504,
      headers: { 'x-amzn-requestid': 'textract-request-2' },
    }))) as typeof fetch;
    const result = await invokeTextractOcr({ documentType: 'resume', images: ['one'] });
    assertEquals(result.ok, false);
    if (result.ok) throw new Error('expected failure');
    assertEquals(result.evidence?.providerRequestId, 'textract-request-2');
    assertEquals(result.evidence?.billablePages, null);
    assertEquals(result.evidence?.reportedCostUsd, null);
  });
});
