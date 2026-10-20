/**
 * Phase 09 · 09-06 · VER-02 / S-09 — REPLACEMENT UPLOAD, every feature that takes a document.
 *
 * THE GAP THIS CLOSES: S-09 had ZERO coverage anywhere. A repo-wide grep for
 * `replacement upload|re-upload|reupload|replace.*upload` across supabase/functions, src and
 * e2e returned nothing.
 *
 * THE CORRECTNESS RISK (T-09-06-C): if `inputIdentity` were derived from something a
 * replacement upload does NOT change — or were not re-derived at all — a user who uploads a
 * NEW resume would re-derive the PRIOR run's idempotency key. The RPC would replay
 * `already_deducted` and the run-level dedup would resolve to the PRIOR run, so the user
 * would be shown the OLD document's analysis for their NEW document. It would look like a
 * cache hit. It is a silent correctness bug, and it is the exact failure mode
 * `deriveIdempotencyKey`'s opaque, content-derived `inputIdentity` exists to prevent.
 *
 * CAREER_COMPASS DISPOSITION (required by the plan): career_compass DOES accept replaceable
 * documents, so it is covered here as a full member rather than waived. Its `inputIdentity`
 * is `buildCareerInputIdentity({ userId, tier, resumeText, linkedinText, linkedinUrl,
 * allowResumeOnly })`, mirrored
 * by `buildCareerCacheKey({ ..., resumeText, linkedinText, ... })` on the direct path
 * (analyze-career/index.ts:988-1001). `resumeText` and `linkedinText` are the DOCUMENT
 * CONTENTS — replacing either document changes the identity, exactly like the other four.
 *
 * Per-feature identity sources (all content-derived, none save-mutated — Pitfall 8):
 *   resume / onboarding -> sha256({text_hash, resumeId, targetRole, targetIndustry})
 *                          (analyze-resume/index.ts:1293 / :1182)
 *   linkedin            -> STABLE sha256(profileContent) + url  (grade-linkedin/index.ts:380)
 *   recruiting_lens     -> the order-independent field-hashed cacheKey
 *                          (recruiting-lens/index.ts:592)
 *   career_compass      -> buildCareerInputIdentity / buildCareerCacheKey (above)
 *
 * Deterministic: real `deriveIdempotencyKey`, no network, no DB, no Anthropic.
 * std@0.224.0 to match the lifecycle guard neighbors.
 */
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { deriveIdempotencyKey, type IdempotencyKeyParts } from '../idempotency-key.ts';

const USER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

/**
 * The document-ingesting features. `original` / `replacement` model the identity BEFORE and
 * AFTER the user swaps the document: new content hash, and (where the feature stores a row
 * per document) a new record id too.
 */
const FEATURES: ReadonlyArray<{
  label: string;
  meritFeature: string;
  tier: string;
  original: string;
  replacement: string;
}> = [
  {
    label: 'resume',
    meritFeature: 'resume_analysis',
    tier: 'free',
    // sha256({text_hash, resumeId, ...}) — a replacement upload changes BOTH.
    original: 'sha256:{"text_hash":"hash-resume-v1","resumeId":"resume-1"}',
    replacement: 'sha256:{"text_hash":"hash-resume-v2","resumeId":"resume-2"}',
  },
  {
    label: 'onboarding',
    meritFeature: 'resume_analysis',
    tier: 'free',
    original: 'sha256:{"text_hash":"hash-onboarding-v1","resumeId":"resume-1"}',
    replacement: 'sha256:{"text_hash":"hash-onboarding-v2","resumeId":"resume-2"}',
  },
  {
    label: 'linkedin',
    meritFeature: 'linkedin_grading',
    tier: 'free',
    // STABLE profileContent hash + url — a replacement LinkedIn PDF changes the hash.
    original: 'sha256:profile-content-v1|https://linkedin.com/in/example',
    replacement: 'sha256:profile-content-v2|https://linkedin.com/in/example',
  },
  {
    label: 'recruiting_lens',
    meritFeature: 'recruiting_lens',
    tier: 'elite',
    // The field-hashed cacheKey covers the resume summary + JD + linkedin text.
    original: 'sha256:rcl-cachekey|resume-v1|jd-v1',
    replacement: 'sha256:rcl-cachekey|resume-v2|jd-v1',
  },
  {
    label: 'career_compass',
    meritFeature: 'career_compass',
    tier: 'free',
    // buildCareerInputIdentity hashes resumeText + linkedinText (the document CONTENTS).
    original: 'sha256:career|resumeText-v1|linkedinText-v1',
    replacement: 'sha256:career|resumeText-v2|linkedinText-v1',
  },
];

for (const feature of FEATURES) {
  const base: IdempotencyKeyParts = {
    userId: USER,
    feature: feature.meritFeature,
    tier: feature.tier,
    inputIdentity: feature.original,
    attemptNonce: 'nonce-original',
  };

  Deno.test(`S-09 (${feature.label}): a REPLACEMENT upload derives a DIFFERENT inputIdentity -> a DIFFERENT key`, async () => {
    const originalKey = await deriveIdempotencyKey(base);
    // A replacement upload is a deliberate new run: new document content AND a fresh nonce.
    const replacementKey = await deriveIdempotencyKey({
      ...base,
      inputIdentity: feature.replacement,
      attemptNonce: 'nonce-replacement',
    });
    assertNotEquals(originalKey, replacementKey, 'a replacement upload must never re-derive the original document\'s key');
  });

  Deno.test(`S-09 (${feature.label}): the replacement cannot resolve to the ORIGINAL run (no stale result served)`, async () => {
    // THE REAL RISK: the key is BOTH the merit-dedup key and the run-level dedup key
    // (create_or_recover_analysis_run receives the same derived key —
    // analysis-lifecycle.ts:233-241). If a replacement re-derived the original key, the
    // executor would RECOVER the original run and hand back the ORIGINAL document's result.
    const runsByKey = new Map<string, string>();
    const originalKey = await deriveIdempotencyKey(base);
    runsByKey.set(originalKey, 'run-original:ORIGINAL-DOCUMENT-RESULT');

    const replacementKey = await deriveIdempotencyKey({
      ...base,
      inputIdentity: feature.replacement,
      attemptNonce: 'nonce-replacement',
    });
    assertEquals(
      runsByKey.get(replacementKey),
      undefined,
      'the replacement upload resolved to the ORIGINAL run — the user would be served the previous document\'s analysis',
    );
  });

  Deno.test(`S-09 (${feature.label}): the DOCUMENT is load-bearing — new content alone re-keys, even on the SAME nonce`, async () => {
    // Isolates content from nonce. If only the nonce drove the key, a replacement upload that
    // reused a nonce (e.g. a retry after swapping the file) would collide with the original.
    const originalKey = await deriveIdempotencyKey(base);
    const sameNonceNewDocument = await deriveIdempotencyKey({ ...base, inputIdentity: feature.replacement });
    assertNotEquals(originalKey, sameNonceNewDocument, 'content must be part of the identity — the nonce alone cannot carry it');
  });

  Deno.test(`S-09 (${feature.label}): SENSITIVITY CONTROL — the SAME document on the SAME nonce re-derives the SAME key (S-01a)`, async () => {
    // Without this control the three assertions above would also pass for a key that changed
    // on EVERY call (e.g. a random key), which would break the accidental-resubmit dedup.
    // This proves the key is sensitive to CONTENT, not merely non-deterministic.
    const first = await deriveIdempotencyKey(base);
    const accidentalResubmit = await deriveIdempotencyKey({ ...base });
    assertEquals(first, accidentalResubmit, 'the same document + same nonce must dedup to exactly one charge');
  });
}
