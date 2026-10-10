// Gap 1 — Task 04-01-01 (LIG-12): JWT auth required, userId from body rejected
// Gap 3 — Task 04-01-09 (LIG-02): Uses claude-haiku-4-5, with maxTokens and timeout each
//   resolved from a single source of truth (getMaxOutput / getTimeout) rather than hardcoded.
//
// Static source analysis: reads index.ts and asserts on its contents.
// This approach avoids mocking Supabase / Anthropic while verifying security-critical
// and model-config properties that must appear in the handler source.

import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';

// On Windows, import.meta.url pathname begins with /C:/... which Deno cannot open.
// Strip the leading slash to get a valid Windows path.
const rawPath = new URL('./index.ts', import.meta.url).pathname;
const INDEX_PATH = rawPath.startsWith('/') && rawPath[2] === ':' ? rawPath.slice(1) : rawPath;
const source = Deno.readTextFileSync(INDEX_PATH);

// ── Gap 1: JWT auth (LIG-12) ────────────────────────────────────

Deno.test('handler imports requireAuth (not requireInternalOrUserAuth)', () => {
  // Must import requireAuth
  assertEquals(source.includes('requireAuth'), true);
  // Must NOT use the wrong auth helper
  assertEquals(source.includes('requireInternalOrUserAuth'), false);
});

Deno.test('handler calls requireAuth with type user', () => {
  // The exact call pattern from the plan
  const hasUserAuthCall =
    source.includes("requireAuth(req, { type: 'user' })") ||
    source.includes('requireAuth(req, { type: "user" })');
  assertEquals(hasUserAuthCall, true);
});

Deno.test('handler does not use body.userId for authentication', () => {
  // userId must come from JWT, never from the request body
  assertEquals(source.includes('body.userId'), false);
});

Deno.test('handler does not destructure userId from body', () => {
  // Patterns like `const { profileData, userId } = body` would be a bypass
  const hasBypass =
    source.includes('const { profileData, userId') ||
    source.includes('const {profileData, userId') ||
    source.includes("body['userId']");
  assertEquals(hasBypass, false);
});

// ── Gap 3: Model configuration (LIG-02, legacy path still has hardcoded values) ──

Deno.test('handler uses claude-haiku-4-5-20251001 model', () => {
  assertEquals(source.includes('claude-haiku-4-5-20251001'), true);
});

Deno.test('handler derives AI-call maxTokens from the central cap (quick task 260608-p5k)', () => {
  // Hard caps replaced the hardcoded 8192 literal; both AI calls now read the
  // per-tier ceiling LINKEDIN_MAX_TOKENS[resolvedTier] (from getMaxOutput).
  assertEquals(source.includes('maxTokens: LINKEDIN_MAX_TOKENS[resolvedTier]'), true);
  assertEquals(source.includes('maxTokens: 8192'), false);
});

// quick task 260713-2ay: the hardcoded `timeoutMs: 60000` literals are GONE. A LinkedIn grade
// really takes 45-70s to generate, so every hardcoded wall below that band aborted mid-flight.
// The timeout now resolves from the single source of truth — the 'linkedin' CallType in
// tier-config (90s for both live tiers). This test's INTENT is unchanged: it pins where the
// LinkedIn timeout comes from. It just pins the NEW source of truth.
Deno.test('handler resolves its LinkedIn timeout from getTimeout(tier, linkedin) — no hardcoded wall', () => {
  // The legacy (MERIT_SYSTEM_ENABLED=false) path resolves via the tier-config CallType...
  assertEquals(source.includes("getTimeout(resolvedTier, 'linkedin')"), true);
  // ...and so does the live merit path.
  assertEquals(source.includes("getTimeout(tier, 'linkedin')"), true);
  // No bare hardcoded timeout literal survives anywhere in the handler.
  assertEquals(source.includes('timeoutMs: 60000'), false);
  assertEquals(source.includes('timeoutMs: 50000'), false);
});

// ── Phase 16: Tier-aware configuration ────────────────────────────
// quick task 260608-p5k: LINKEDIN_MAX_TOKENS is now derived from getMaxOutput
// (free 5000 / elite 8000), not hardcoded literals.

Deno.test('LIG-07: handler derives LINKEDIN_MAX_TOKENS from getMaxOutput', () => {
  assertEquals(source.includes("getMaxOutput('linkedinGrader', 'free')"), true);
  assertEquals(source.includes("getMaxOutput('linkedinGrader', 'elite')"), true);
});

Deno.test('LIG-07: handler imports getMaxOutput and getMaxInputChars from tier-config', () => {
  assertEquals(source.includes('getMaxOutput'), true);
  assertEquals(source.includes('getMaxInputChars'), true);
});

Deno.test('BACK-09: handler imports loadPromptVariant', () => {
  assertEquals(source.includes('loadPromptVariant'), true);
});

Deno.test('BACK-09: handler imports getModel from tier-config', () => {
  assertEquals(source.includes('getModel'), true);
});

Deno.test('BACK-09: handler imports getTimeout from tier-config', () => {
  assertEquals(source.includes('getTimeout'), true);
});

Deno.test('handler does not read the retired LinkedIn free-scan flag', () => {
  assertEquals(source.includes('free_linkedin_scan_used'), false);
});

Deno.test('handler has no free-scan bypass branch or log entry', () => {
  assertEquals(source.includes('free-scan-bypass'), false);
  assertEquals(source.includes('freeScanThisRequest'), false);
});

Deno.test('BACK-09: handler uses loadPromptVariant with linkedin feature', () => {
  const hasLinkedinVariant = source.includes("loadPromptVariant('linkedin'") || source.includes('loadPromptVariant("linkedin"');
  assertEquals(hasLinkedinVariant, true);
});
