import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getRuntimeEnvironment } from "./runtime-environment.ts";

Deno.test("runtime environment accepts only the four exact trusted names", () => {
  for (const value of ["production", "staging", "development", "test"]) {
    assertEquals(getRuntimeEnvironment({ readEnv: () => value }), value);
  }
});

Deno.test("runtime environment rejects missing, unknown, and ambiguous values", () => {
  for (const value of [undefined, "", "prod", "Production", "TRUE", "1"]) {
    assertThrows(
      () => getRuntimeEnvironment({ readEnv: () => value }),
      Error,
      "invalid_STRIVO_RUNTIME_ENV",
    );
  }
});

Deno.test("runtime environment never infers from URL-like or client values", () => {
  const clientSupplied = "production";
  const readEnv = (name: string): string | undefined => {
    if (name === "SUPABASE_URL") return "https://prod.example.invalid";
    if (name === "APP_URL") return clientSupplied;
    return undefined;
  };
  assertThrows(
    () => getRuntimeEnvironment({ readEnv }),
    Error,
    "invalid_STRIVO_RUNTIME_ENV",
  );
});
