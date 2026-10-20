import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const source = await Deno.readTextFile(new URL("../index.ts", import.meta.url));

Deno.test("interview prep history: records usage with interview_quizzes id", () => {
  assert(source.includes("const quizId = quizInsert.data.id as string;"));
  assert(source.includes("recordUsageWithAnalysis(userId, 'interview_prep', 1, quizId)"));
});

Deno.test("interview prep history: usage write failure is terminal", () => {
  assert(source.includes("throw new MeritRefundable(500, 'Could not record interview prep usage.')"));
});
