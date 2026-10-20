import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractResume } from "../extract-resume.ts";

type Row = Record<string, unknown>;
type ResumeAnalysisInput = Parameters<typeof extractResume>[1];

class QueryBuilder {
  private filters: Record<string, unknown> = {};
  private inserted: Row | null = null;

  constructor(private readonly db: MockSupabase, private readonly table: string) {}

  select(_columns: string): QueryBuilder {
    return this;
  }

  eq(column: string, value: unknown): QueryBuilder {
    this.filters[column] = value;
    return this;
  }

  order(_column: string, _opts?: unknown): QueryBuilder {
    return this;
  }

  limit(_count: number): QueryBuilder {
    return this;
  }

  insert(row: Row): QueryBuilder {
    this.inserted = this.db.insert(this.table, row);
    return this;
  }

  maybeSingle(): { data: Row | null; error: null } {
    return { data: this.db.find(this.table, this.filters), error: null };
  }

  single(): { data: Row | null; error: null } {
    return { data: this.inserted, error: null };
  }
}

class MockSupabase {
  rows: Record<string, Row[]> = {
    // extractResume verifies the referenced resume still exists before inserting a version
    // row; seed the fixture's source_reference ("resume-1") so the happy paths proceed.
    resumes: [{ id: "resume-1" }],
    resume_versions: [],
    resume_sections: [],
    resume_bullets: [],
    scores: [],
    recommendations: [],
  };

  from(table: string): QueryBuilder {
    return new QueryBuilder(this, table);
  }

  insert(table: string, row: Row): Row {
    const stored = { id: `${table}-${this.rows[table].length + 1}`, ...row };
    this.rows[table].push(stored);
    return stored;
  }

  find(table: string, filters: Record<string, unknown>): Row | null {
    return this.rows[table].find(row =>
      Object.entries(filters).every(([key, value]) => row[key] === value)
    ) ?? null;
  }
}

function logCollector() {
  const warnings: Row[] = [];
  return {
    warnings,
    log: {
      info: () => {},
      warn: (_msg: string, data?: Row) => warnings.push(data ?? {}),
      error: () => {},
    },
  };
}

async function loadFixture(name: string): Promise<Row> {
  const text = await Deno.readTextFile(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(text);
}

Deno.test("extractResume inserts version, sections, bullets, score, and recommendations", async () => {
  const supabase = new MockSupabase();
  const { log } = logCollector();
  const fixture = await loadFixture("resume-analysis.json");

  const result = await extractResume(supabase, fixture as ResumeAnalysisInput, log);

  assertEquals(result.skipped, false);
  assertEquals(supabase.rows.resume_versions.length, 1);
  assertEquals(supabase.rows.resume_sections.length, 2);
  assertEquals(supabase.rows.resume_bullets.length, 2);
  assertEquals(supabase.rows.scores.length, 1);
  assertEquals(supabase.rows.scores[0].version_type, "resume");
  // The fixture has 1 bullet with a suggestedImprovement — expect 1 recommendation row.
  assertEquals(supabase.rows.recommendations.length, 1);
  assertEquals(supabase.rows.recommendations[0].feature, "resume_analysis");
  assertEquals(supabase.rows.recommendations[0].target_ref_type, "bullet");
});

Deno.test("extractResume is idempotent for the same analysis_results_id", async () => {
  const supabase = new MockSupabase();
  const { log } = logCollector();
  const fixture = await loadFixture("resume-analysis.json");

  await extractResume(supabase, fixture as ResumeAnalysisInput, log);
  const second = await extractResume(supabase, fixture as ResumeAnalysisInput, log);

  assertEquals(second.skipped, true);
  assertEquals(supabase.rows.resume_versions.length, 1);
  // recommendations are only written on first extraction; skip path writes none
  assertEquals(supabase.rows.recommendations.length, 1);
});

Deno.test("extractResume skips when the referenced resume was deleted", async () => {
  const supabase = new MockSupabase();
  supabase.rows.resumes = []; // resume deleted after the analysis was recorded
  const { log, warnings } = logCollector();
  const fixture = await loadFixture("resume-analysis.json");

  const result = await extractResume(supabase, fixture as ResumeAnalysisInput, log);

  // Must SKIP, not throw: the row is permanently unextractable and inserting would violate
  // resume_versions_resume_id_fkey, which the */15 catchup cron would retry forever.
  assertEquals(result.ok, true);
  assertEquals(result.skipped, true);
  assertEquals(result.reason, "resume_deleted");
  assertEquals(supabase.rows.resume_versions.length, 0);
  assert(warnings.some(warning => warning.reason === "resume_deleted"));
});

Deno.test("extractResume logs warning and still succeeds when sections are missing", async () => {
  const supabase = new MockSupabase();
  const { log, warnings } = logCollector();
  const fixture = await loadFixture("resume-analysis.json");
  const malformed = {
    ...fixture,
    id: "analysis-resume-malformed",
    raw_response: {
      overallScore: 65,
      suggestions: [{ text: "Add quantified outcomes." }],
    },
  };

  const result = await extractResume(supabase, malformed as ResumeAnalysisInput, log);

  assertEquals(result.skipped, false);
  assert(warnings.some(warning => warning.field === "sections"));
  assertEquals(supabase.rows.resume_versions.length, 1);
});
