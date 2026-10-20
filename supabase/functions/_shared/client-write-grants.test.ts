import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const REPAIR_NAME = "20260728010000_reconcile_client_write_column_grants.sql";
const REPAIR_URL = new URL(`../../migrations/${REPAIR_NAME}`, import.meta.url);
const ROLLBACK_URL = new URL(
  `../../migrations/rollback/${REPAIR_NAME.replace(".sql", ".rollback.sql")}`,
  import.meta.url,
);
const MIGRATIONS_URL = new URL("../../migrations/", import.meta.url);

const RESUMES_INSERT = [
  "user_id",
  "file_name",
  "file_url",
  "file_path",
  "file_hash",
  "file_size",
  "extracted_text",
  "text_hash",
  "document_hash",
  "extraction_version",
  "extraction_metadata",
];
const RESUMES_UPDATE = RESUMES_INSERT.filter((column) => column !== "user_id");
const CAREER_TARGETS_COLUMNS = [
  "user_id",
  "target_roles",
  "target_industries",
  "target_companies",
  "location_preference",
  "career_goals",
  "professional_goal",
  "professional_goal_set_at",
];

function grantedColumns(
  source: string,
  table: "resumes" | "career_targets",
  privilege: "insert" | "update",
): string[] {
  const match = source.match(
    new RegExp(
      `grant\\s+${privilege}\\s*\\(([^)]*)\\)\\s*on\\s+public\\.${table}\\s+to\\s+authenticated`,
      "i",
    ),
  );
  assert(match, `missing column-scoped ${privilege} grant on public.${table}`);
  return match[1]
    .split(",")
    .map((column) => column.trim().toLowerCase())
    .filter(Boolean)
    .sort();
}

function sorted(columns: string[]): string[] {
  return [...columns].sort();
}

function hasBlanketClientWriteGrant(source: string): boolean {
  return /grant\s+(?:(?:insert|update|all)(?:\s*,\s*(?:insert|update|all))*)\s+on\s+public\.(?:resumes|career_targets)\s+to\s+authenticated/i
    .test(source);
}

Deno.test("client-write grants: repair restores the exact legitimate resumes columns", async () => {
  const source = await Deno.readTextFile(REPAIR_URL);

  assertEquals(
    grantedColumns(source, "resumes", "insert"),
    sorted(RESUMES_INSERT),
  );
  assertEquals(
    grantedColumns(source, "resumes", "update"),
    sorted(RESUMES_UPDATE),
  );

  for (
    const serverOwned of [
      "analyzed_tier",
      "grading_data",
      "overall_score",
      "analyzed_at",
      "archive_path",
    ]
  ) {
    assert(
      !source.match(
        new RegExp(
          `grant\\s+(?:insert|update)\\s*\\([^)]*\\b${serverOwned}\\b`,
          "i",
        ),
      ),
      `${serverOwned} must remain server-owned on public.resumes`,
    );
  }
});

Deno.test("client-write grants: repair preserves the career-targets score boundary", async () => {
  const source = await Deno.readTextFile(REPAIR_URL);

  assertEquals(
    grantedColumns(source, "career_targets", "insert"),
    sorted(CAREER_TARGETS_COLUMNS),
  );
  assertEquals(
    grantedColumns(source, "career_targets", "update"),
    sorted(CAREER_TARGETS_COLUMNS),
  );

  for (
    const triggerOwned of [
      "professional_goal_structured",
      "goal_readiness_score",
      "goal_readiness_components",
      "goal_readiness_computed_at",
    ]
  ) {
    assert(
      !source.match(
        new RegExp(
          `grant\\s+(?:insert|update)\\s*\\([^)]*\\b${triggerOwned}\\b`,
          "i",
        ),
      ),
      `${triggerOwned} must remain trigger-owned on public.career_targets`,
    );
  }
});

Deno.test("client-write grants: the repair and later migrations never restore blanket writes", async () => {
  const repair = await Deno.readTextFile(REPAIR_URL);
  assert(
    /revoke\s+insert\s*,\s*update\s+on\s+public\.resumes\s+from\s+authenticated/i
      .test(repair),
    "repair must revoke the existing blanket resumes privilege before column grants",
  );
  assert(
    /revoke\s+insert\s*,\s*update\s+on\s+public\.career_targets\s+from\s+authenticated/i
      .test(repair),
    "repair must revoke the existing blanket career_targets privilege before column grants",
  );
  assert(!hasBlanketClientWriteGrant(repair));

  for await (const entry of Deno.readDir(MIGRATIONS_URL)) {
    if (
      !entry.isFile || entry.name < REPAIR_NAME || !entry.name.endsWith(".sql")
    ) {
      continue;
    }
    const source = await Deno.readTextFile(new URL(entry.name, MIGRATIONS_URL));
    assert(
      !hasBlanketClientWriteGrant(source),
      `${entry.name} reintroduces blanket authenticated writes on resumes/career_targets`,
    );
  }
});

Deno.test("client-write grants: rollback is explicit about restoring the unsafe pre-repair posture", async () => {
  const rollback = await Deno.readTextFile(ROLLBACK_URL);
  assert(
    /grant\s+insert\s*,\s*update\s+on\s+public\.resumes\s+to\s+authenticated/i
      .test(rollback),
  );
  assert(
    /grant\s+insert\s*,\s*update\s+on\s+public\.career_targets\s+to\s+authenticated/i
      .test(rollback),
  );
  assert(
    /reopens/i.test(rollback),
    "rollback must warn that it reopens the server-owned column boundary",
  );
});
