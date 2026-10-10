---
quick_id: 260416-rgc
description: Fix Vercel preview build failure - unterminated regex in SkillsGapAnalysis.tsx
date: 2026-04-17
---

# Quick Task: Fix Vercel Preview Build Failure

## Task 1: Remove extra closing div tag

- **files**: `src/pages/SkillsGapAnalysis.tsx`
- **action**: Remove the extra `</div>` at line 490 in the free-tier gate return block. The JSX tree has one more closing `</div>` than opening `<div>` tags, causing rolldown to parse `</` as the start of a regex literal.
- **verify**: `npm run build` completes without errors
- **done**: Build passes
