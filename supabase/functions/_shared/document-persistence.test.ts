import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  lookupAcceptedExtraction,
  persistAcceptedExtraction,
  serializeExtractionMetadata,
} from "./document-persistence.ts";
import type { ExtractionResult } from "./document-extraction-types.ts";

const acceptedResumeResult: ExtractionResult = {
  ok: true,
  text: "Jordan Rivera\n\nExperience\nEducation\nSkills\n".repeat(30),
  metadata: {
    provider: "ollama",
    attemptedProviders: ["pdf_parser", "ollama"],
    qualityStatus: "accepted",
    documentType: "resume",
    textHash: "a".repeat(64),
    documentHash: "d".repeat(64),
    extractionVersion: "phase51-v1",
    extractedAt: "2026-06-05T12:00:00.000Z",
    reusedAcceptedText: false,
    fallbackReason: "pdf_parser_too_short",
  },
};

const acceptedLinkedinResult: ExtractionResult = {
  ok: true,
  text: "LinkedIn\nAbout\nExperience\nEducation\nSkills\n".repeat(35),
  metadata: {
    provider: "claude_ocr",
    attemptedProviders: ["pdf_parser", "claude_ocr"],
    qualityStatus: "accepted",
    documentType: "linkedin_profile",
    textHash: "b".repeat(64),
    documentHash: "e".repeat(64),
    extractionVersion: "phase51-v1",
    extractedAt: "2026-06-05T13:00:00.000Z",
    reusedAcceptedText: false,
    fallbackReason: "ollama_skipped_no_images",
  },
};

const rejectedResult: ExtractionResult = {
  ok: false,
  attemptedProviders: ["pdf_parser", "ollama", "mistral", "textract", "claude_ocr"],
  documentType: "resume",
  reason: "all_providers_failed",
};

interface UpdateCall {
  table: string;
  payload: Record<string, unknown>;
  filters: Array<{ column: string; value: unknown }>;
}

class MockQuery {
  readonly filters: Array<{ column: string; value: unknown }> = [];

  constructor(
    private readonly calls: UpdateCall[],
    private readonly table: string,
    private readonly error: unknown = null,
    private readonly selectRow: Record<string, unknown> | null = null,
  ) {}

  update(payload: Record<string, unknown>): MockQuery {
    this.calls.push({ table: this.table, payload, filters: this.filters });
    return this;
  }

  eq(column: string, value: unknown): MockQuery {
    this.filters.push({ column, value });
    return this;
  }

  select(_columns: string): MockQuery {
    return this;
  }

  maybeSingle<T = Record<string, unknown>>(): Promise<{ data: T | null; error: unknown }> {
    return Promise.resolve({ data: this.selectRow as T | null, error: this.error });
  }

  then(resolve: (value: { error: unknown }) => void): void {
    resolve({ error: this.error });
  }
}

class MockSupabase {
  readonly calls: UpdateCall[] = [];

  constructor(
    private readonly error: unknown = null,
    private readonly rows: Record<string, Record<string, unknown> | null> = {},
  ) {}

  from(table: string): MockQuery {
    return new MockQuery(this.calls, table, this.error, this.rows[table] ?? null);
  }
}

Deno.test("persistAcceptedExtraction writes resume text, hash, metadata with resume id and user filter", async () => {
  const supabase = new MockSupabase();

  const result = await persistAcceptedExtraction({
    supabase,
    target: "resume",
    userId: "user-1",
    resumeId: "resume-1",
    result: acceptedResumeResult,
  });

  assert(result.ok);
  assertEquals(supabase.calls.length, 1);
  assertEquals(supabase.calls[0].table, "resumes");
  assertEquals(supabase.calls[0].payload, {
      extracted_text: acceptedResumeResult.text,
      text_hash: "a".repeat(64),
      document_hash: "d".repeat(64),
      extraction_version: "phase51-v1",
      extraction_metadata: {
        provider: "ollama",
        attempted_providers: ["pdf_parser", "ollama"],
        quality_status: "accepted",
        document_type: "resume",
        text_hash: "a".repeat(64),
        document_hash: "d".repeat(64),
        extraction_version: "phase51-v1",
        extracted_at: "2026-06-05T12:00:00.000Z",
        reused_accepted_text: false,
        fallback_reason: "pdf_parser_too_short",
      },
  });
  assertEquals(supabase.calls[0].filters, [
    { column: "id", value: "resume-1" },
    { column: "user_id", value: "user-1" },
  ]);
});

Deno.test("persistAcceptedExtraction writes LinkedIn profile source fields only after acceptance", async () => {
  const supabase = new MockSupabase();

  const result = await persistAcceptedExtraction({
    supabase,
    target: "linkedin_profile",
    userId: "user-2",
    filename: "linkedin.pdf",
    result: acceptedLinkedinResult,
  });

  assert(result.ok);
  assertEquals(supabase.calls.length, 1);
  assertEquals(supabase.calls[0].table, "profiles");
  assertEquals(supabase.calls[0].payload, {
    linkedin_pdf_content: acceptedLinkedinResult.text,
    linkedin_pdf_filename: "linkedin.pdf",
    linkedin_pdf_updated_at: "2026-06-05T13:00:00.000Z",
    linkedin_pdf_text_hash: "b".repeat(64),
    linkedin_pdf_document_hash: "e".repeat(64),
    linkedin_pdf_extraction_version: "phase51-v1",
    linkedin_pdf_extraction_metadata: {
      provider: "claude_ocr",
      attempted_providers: ["pdf_parser", "claude_ocr"],
      quality_status: "accepted",
      document_type: "linkedin_profile",
      text_hash: "b".repeat(64),
      document_hash: "e".repeat(64),
      extraction_version: "phase51-v1",
      extracted_at: "2026-06-05T13:00:00.000Z",
      reused_accepted_text: false,
      fallback_reason: "ollama_skipped_no_images",
    },
  });
  assertEquals(supabase.calls[0].filters, [
    { column: "id", value: "user-2" },
  ]);
});

Deno.test("persistAcceptedExtraction is a no-op for rejected extraction results", async () => {
  const supabase = new MockSupabase();

  const result = await persistAcceptedExtraction({
    supabase,
    target: "resume",
    userId: "user-1",
    resumeId: "resume-1",
    result: rejectedResult,
  });

  assert(result.ok);
  assertEquals(result.persisted, false);
  assertEquals(supabase.calls.length, 0);
});

Deno.test("serializeExtractionMetadata keeps only concise operational fields", () => {
  const metadata = serializeExtractionMetadata({
    ...acceptedResumeResult.metadata,
    prompt: "do not persist",
    messages: ["do not persist"],
    images: ["do not persist"],
    response: { raw: true },
    transcript: "do not persist",
  } as typeof acceptedResumeResult.metadata & Record<string, unknown>);

  assertEquals(Object.keys(metadata).sort(), [
    "attempted_providers",
    "document_hash",
    "document_type",
    "extracted_at",
    "extraction_version",
    "fallback_reason",
    "provider",
    "quality_status",
    "reused_accepted_text",
    "text_hash",
  ]);
  assertEquals("prompt" in metadata, false);
  assertEquals("messages" in metadata, false);
  assertEquals("images" in metadata, false);
  assertEquals("response" in metadata, false);
  assertEquals("transcript" in metadata, false);
});

Deno.test("lookupAcceptedExtraction returns user-scoped accepted resume text by document identity", async () => {
  const supabase = new MockSupabase(null, {
    resumes: {
      extracted_text: acceptedResumeResult.text,
      text_hash: "a".repeat(64),
      extraction_metadata: {
        extracted_at: "2026-06-05T12:00:00.000Z",
      },
    },
  });

  const result = await lookupAcceptedExtraction({
    supabase,
    policy: {
      userId: "user-1",
      tier: "free",
      allowClaudeOcr: false,
      documentType: "resume",
      documentHash: "d".repeat(64),
      extractionVersion: "phase51-v1",
    },
  });

  assert(result.ok);
  assert(result.found);
  if (!result.found) throw new Error("expected accepted extraction reuse hit");
  assertEquals(result.result.text, acceptedResumeResult.text);
  assertEquals(result.result.metadata.reusedAcceptedText, true);
  assertEquals(supabase.calls.length, 0);
});
