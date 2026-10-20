/**
 * Deno unit tests for createLogger.
 * Run with: deno test supabase/functions/_shared/logger.test.ts
 */
import { assertEquals, assertMatch, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createLogger } from "./logger.ts";

function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  console.error = (...args: unknown[]) => lines.push(args.map(String).join(" "));
  return {
    lines,
    restore: () => {
      console.log = origLog;
      console.error = origError;
    },
  };
}

Deno.test("info log produces valid JSON line", () => {
  const cap = captureConsole();
  try {
    const log = createLogger("test-fn");
    log.info("hello", { x: 1 });
    assertEquals(cap.lines.length, 1);
    const entry = JSON.parse(cap.lines[0]);
    assertEquals(entry.level, "info");
    assertEquals(entry.msg, "hello");
    assertEquals(entry.fn, "test-fn");
    assertEquals(entry.x, 1);
    assert(typeof entry.ts === "string");
  } finally {
    cap.restore();
  }
});

Deno.test("error log also produces valid JSON line", () => {
  const cap = captureConsole();
  try {
    const log = createLogger("test-fn");
    log.error("bad thing", { code: 500 });
    assertEquals(cap.lines.length, 1);
    const entry = JSON.parse(cap.lines[0]);
    assertEquals(entry.level, "error");
    assertEquals(entry.code, 500);
  } finally {
    cap.restore();
  }
});

Deno.test("reqId is included when provided", () => {
  const cap = captureConsole();
  try {
    const log = createLogger("test-fn", "abc123");
    log.info("msg");
    const entry = JSON.parse(cap.lines[0]);
    assertEquals(entry.reqId, "abc123");
  } finally {
    cap.restore();
  }
});

Deno.test("reqId is absent when not provided", () => {
  const cap = captureConsole();
  try {
    const log = createLogger("test-fn");
    log.info("msg");
    const entry = JSON.parse(cap.lines[0]);
    assertEquals("reqId" in entry, false);
  } finally {
    cap.restore();
  }
});

Deno.test("timer returns a function that returns elapsed ms", async () => {
  const cap = captureConsole();
  try {
    const log = createLogger("test-fn");
    const done = log.timer("op");
    await new Promise((r) => setTimeout(r, 20));
    const ms = done();
    assert(ms >= 20, `Expected >= 20ms, got ${ms}`);
    // timer emits its own log line
    assert(cap.lines.length >= 1);
    const timerEntry = JSON.parse(cap.lines[cap.lines.length - 1]);
    assertEquals(timerEntry.msg, "op completed");
    assert(typeof timerEntry.durationMs === "number");
  } finally {
    cap.restore();
  }
});

Deno.test("warn and debug levels are logged", () => {
  const cap = captureConsole();
  try {
    const log = createLogger("test-fn");
    log.warn("watch out");
    log.debug("verbose info");
    assertEquals(cap.lines.length, 2);
    assertEquals(JSON.parse(cap.lines[0]).level, "warn");
    assertEquals(JSON.parse(cap.lines[1]).level, "debug");
  } finally {
    cap.restore();
  }
});
