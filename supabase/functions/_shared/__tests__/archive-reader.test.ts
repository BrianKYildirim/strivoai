/**
 * Deno unit tests for _shared/archive-reader.ts (Phase 42 L5 DB-STO-01).
 *
 * Run with: deno test supabase/functions/_shared/__tests__/archive-reader.test.ts --no-check --allow-env
 *
 * Tests use in-memory stubs for SupabaseClient — no live network calls.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { readWithArchiveFallback } from "../archive-reader.ts";

// ── Gzip helper (compress a string to a Blob for test fixtures) ───────────────

async function gzipString(text: string): Promise<Blob> {
  const encoded = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  }).pipeThrough(new CompressionStream("gzip"));

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return new Blob([out], { type: "application/gzip" });
}

// ── Mock SupabaseClient builder ───────────────────────────────────────────────

type MockDbRow = Record<string, unknown> | null;

function buildMockClient(opts: {
  dbRow: MockDbRow;
  storageBlob?: Blob | null;
  storageError?: string;
}): any {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                maybeSingle: async () => ({
                  data: opts.dbRow,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
    storage: {
      from(_bucket: string) {
        return {
          download: async (_path: string) => {
            if (opts.storageError) {
              return { data: null, error: { message: opts.storageError } };
            }
            return { data: opts.storageBlob ?? null, error: null };
          },
        };
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

Deno.test("(a) inline path: non-NULL inline column returns value without Storage call", async () => {
  const inlinePayload = { overallScore: 82, suggestions: ["improve bullet"] };
  let storageCalled = false;

  const client: any = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                maybeSingle: async () => ({
                  data: { grading_data: inlinePayload, archive_path: null },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
    storage: {
      from(_bucket: string) {
        storageCalled = true;
        return {
          download: async (_path: string) => ({ data: null, error: null }),
        };
      },
    },
  };

  const result = await readWithArchiveFallback(
    client,
    "resumes",
    "row-id-001",
    "grading_data",
    "archive_path",
  );

  assertEquals(result, inlinePayload, "Should return inline payload");
  assertEquals(storageCalled, false, "Storage should NOT have been called for inline path");
});

Deno.test("(b) Storage path: inline NULL + archivePath set → download + gunzip + parse → returns correct JSON", async () => {
  const expectedPayload = { overallScore: 78, tier: "pro" };
  const gzipped = await gzipString(JSON.stringify(expectedPayload));

  const client = buildMockClient({
    dbRow: { grading_data: null, archive_path: "user-abc/resumes/row-id-002.json.gz" },
    storageBlob: gzipped,
  });

  const result = await readWithArchiveFallback(
    client,
    "resumes",
    "row-id-002",
    "grading_data",
    "archive_path",
  );

  assertEquals(result, expectedPayload, "Should return JSON from archive");
});

Deno.test("(c) missing path: both inline and archive_path are NULL → returns null", async () => {
  const client = buildMockClient({
    dbRow: { grading_data: null, archive_path: null },
  });

  const result = await readWithArchiveFallback(
    client,
    "resumes",
    "row-id-003",
    "grading_data",
    "archive_path",
  );

  assertEquals(result, null, "Should return null when both columns are NULL");
});

Deno.test("(d) corrupted gzip: gracefully returns null and logs warn (no throw)", async () => {
  // Construct a Blob with invalid gzip data (not actual gzip)
  const corruptBlob = new Blob([new Uint8Array([0x00, 0x01, 0x02, 0x03])], {
    type: "application/gzip",
  });

  const client = buildMockClient({
    dbRow: { grading_data: null, archive_path: "user-abc/resumes/corrupt.json.gz" },
    storageBlob: corruptBlob,
  });

  let result: unknown = "NOT_NULL";
  try {
    result = await readWithArchiveFallback(
      client,
      "resumes",
      "row-id-004",
      "grading_data",
      "archive_path",
    );
  } catch (err) {
    throw new Error(
      `readWithArchiveFallback should not throw on corrupted gzip, but threw: ${err}`,
    );
  }

  assertEquals(result, null, "Should return null on corrupted gzip (never throw)");
});

Deno.test("(e) Storage download error: returns null and does not throw", async () => {
  const client = buildMockClient({
    dbRow: { grading_data: null, archive_path: "user-abc/resumes/row-id-005.json.gz" },
    storageError: "Object not found",
  });

  let result: unknown = "NOT_NULL";
  try {
    result = await readWithArchiveFallback(
      client,
      "resumes",
      "row-id-005",
      "grading_data",
      "archive_path",
    );
  } catch (err) {
    throw new Error(
      `readWithArchiveFallback should not throw on download error, but threw: ${err}`,
    );
  }

  assertEquals(result, null, "Should return null on Storage download error (never throw)");
});
