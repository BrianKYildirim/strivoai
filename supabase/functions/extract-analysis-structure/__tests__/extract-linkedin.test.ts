import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractLinkedIn } from "../extract-linkedin.ts";

type Row = Record<string, unknown>;
type LinkedInAnalysisInput = Parameters<typeof extractLinkedIn>[1];

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
    linkedin_grades: [{ id: "grade-1", user_id: "user-1", profile_identifier: "john-doe" }],
    linkedin_versions: [],
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
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

async function loadFixture(name: string): Promise<Row> {
  const text = await Deno.readTextFile(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(text);
}

Deno.test("extractLinkedIn inserts version with linkedin_grade_id, score, and recommendations", async () => {
  const supabase = new MockSupabase();
  const fixture = await loadFixture("linkedin-grading.json");

  const result = await extractLinkedIn(supabase, fixture as LinkedInAnalysisInput, logCollector());

  assertEquals(result.skipped, false);
  assertEquals(supabase.rows.linkedin_versions.length, 1);
  assertEquals(supabase.rows.linkedin_versions[0].linkedin_grade_id, "grade-1");
  assertEquals(supabase.rows.scores.length, 1);
  assertEquals(supabase.rows.scores[0].version_type, "linkedin");
  // The fixture has 2 topFixes — expect 2 recommendation rows.
  assertEquals(supabase.rows.recommendations.length, 2);
  assertEquals(supabase.rows.recommendations[0].feature, "linkedin_grading");
  assertEquals(supabase.rows.recommendations[0].target_ref_type, "version");
});

Deno.test("extractLinkedIn is idempotent for the same analysis_results_id", async () => {
  const supabase = new MockSupabase();
  const fixture = await loadFixture("linkedin-grading.json");

  await extractLinkedIn(supabase, fixture as LinkedInAnalysisInput, logCollector());
  const second = await extractLinkedIn(supabase, fixture as LinkedInAnalysisInput, logCollector());

  assertEquals(second.skipped, true);
  assertEquals(supabase.rows.linkedin_versions.length, 1);
  // recommendations are only written on first extraction; skip path writes none
  assertEquals(supabase.rows.recommendations.length, 2);
});
