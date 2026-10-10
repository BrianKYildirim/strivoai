import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const promptSource = await Deno.readTextFile(
  new URL("../_shared/resume-prompts.ts", import.meta.url),
);
const handlerSource = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);

Deno.test("resume prompts omit obsolete Priority Actions fields", () => {
  assertEquals(promptSource.includes("priorityActions"), false);
  assertEquals(promptSource.includes("quickActions"), false);
  assertEquals(promptSource.includes("Priority Actions"), false);
});

Deno.test("resume backend keeps Priority Improvements as the generated fix surface", () => {
  assert(promptSource.includes("priorityImprovements"));
  assert(handlerSource.includes("priorityImprovements") || promptSource.includes("priorityImprovements"));
});
