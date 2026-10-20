---
task: Pre-launch blocker sweep (security audit, perf, dead code, launch gate)
date: 2026-07-26
branch: staging
status: complete (non-destructive fixes applied; prod deploys + breaking upgrades deferred)
commits:
  - d785c5d6 db: replay-safe guards + service_role grants
  - 5f9fee3f db: fresh-env client grants + tier self-upgrade trigger (+ proof 9/9)
  - ec64d3d8 load-testing: seed resumes via service role (least-privilege)
  - 7fd50b12 perf: route code-splitting + vendor chunks + resized images (~3.4MB)
  - cf168e3c security: lock down scheduled_emails (was public anon read+write)
  - 0e059893 cleanup: remove 2 dead hooks
---

# Findings & fixes (this sweep)

## Security
- CRITICAL scheduled_emails public/anon read+write → FIXED (cf168e3c, migration 20260726140000). Proven: anon 401, service_role intact.
- HIGH prod tier self-upgrade (profiles.subscription_tier client-writable) → FIXED (5f9fee3f trigger). Proven 9/9 + RED.
- Secrets/bundle: CLEAN. Storage buckets private + owner-scoped. Uploads validated. Admin isolation server-enforced (has_role). Edge fn authz all gated. (2 low: 365-day signed URLs; getPublicUrl on private bucket — noted, not fixed.)

## Perf
- 1.8MB monolith → route code-splitting + vendor chunks; ~4.2MB images → 804KB. build green.

## Dead code
- Removed useAchievements.ts, useScoreHistory.ts (proven 0 refs). Others = false positives, kept.

## Deps
- npm audit: postcss HIGH + esbuild low have no clean non-breaking fix (locked behind promptfoo/react-router majors). react-router v6→v7 (prod, open-redirect) + promptfoo chain (dev-only) = deferred breaking upgrades.

## Gate (local)
lint PASS · type-check PASS · vitest 861/861 · deno edge 1437/0 · build PASS · clean db reset exit 0.
test:edge:remote (needs preview) + e2e (needs running app) NOT run here.

## Awaiting prod deploy (3 migrations, security-relevant): 20260726120000/130000/140000.
