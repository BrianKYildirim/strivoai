---
phase: 06
slug: dependency-hygiene
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-20
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Register authored at plan time (all 6 PLANs carried a `<threat_model>` block). All threats verified CLOSED against the implemented codebase, lockfiles, and the NFR-02 bump ledger — evidence-based short-circuit (threats_open: 0 + plan-time register), no new-threat scan required.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm/registry → `package.json` | Direct dependency declarations and version ranges added/removed this phase | Package identity + version (typosquat / wrong-major risk) |
| `package.json` → `package-lock.json` / root `deno.lock` | Resolved versions pinned with SRI integrity hashes; `npm ci` is the hard reproducibility/integrity gate | SRI integrity hashes; lockfile-vs-manifest consistency |
| Lockfile → build + `verify:baseline` runtime | Bumped/removed deps reach the build, vitest, deno, and Playwright nets | Behavioral/visual surface of every changed dependency |
| `ws` override → production `@supabase/realtime-js` websocket | The forced `ws@^8.21.0` override sits on a production realtime path (`Results.tsx`) | Live websocket frames (realtime DB updates) |
| Stripe / Supabase point releases → payment + auth paths | Business-critical batches isolated as their own revert units | Payment session + auth-session state |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Tampering (build integrity) | DEP-02 removals (html2canvas/jspdf/react-markdown/@tailwindcss/typography) | mitigate | `audit:deps`+knip at HEAD, zero-reference `rg` sweep over src/supabase/scripts/e2e/configs, build+`verify:baseline` gate; KEEP-LIST honored. **Verified:** all 4 absent from `package.json`, zero live imports (VERIFICATION SC-1); build 0 / vitest 457 green | closed |
| T-06-02 | Spoofing (package identity) | `dotenv` devDep declare | mitigate | Pinned to already-transitively-resolved `^17.4.2` so install dedupes to the existing integrity-hashed copy. **Verified:** `dotenv ^17.4.2` in devDependencies | closed |
| T-06-03 | Tampering (lockfile integrity) | mid-stream `deno.lock` regen | transfer | Deferred authoritative relock + `npm ci` proof to Plan 06-06 (strictly last, Pitfall 6). **Verified:** 06-06 performed relock last; `npm ci` exit 0 | closed |
| T-06-04 | Tampering (visual/behavioral drift) | recharts 2→3, date-fns 3→4 | mitigate | D-02 BLOCKING operator smoke on each consumer surface, atomic-per-major revert. **Verified:** 06-02 `autonomous:false`, operator smoke recorded; `recharts ^3.8.1`, `date-fns ^4.4.0` | closed |
| T-06-05 | Spoofing (unexpected major) | recharts/date-fns install | mitigate | Pinned exact researched targets (no floating `@latest`); lock writes integrity hashes. **Verified:** exact pins in `package.json` | closed |
| T-06-06 | Tampering (coupled-internal removal) | recharts v3 internals (recharts-scale/react-smooth) | mitigate | Consumer sweep confirmed public-API-only; re-grep before bump. **Verified:** `verify:baseline` green, no internal-API usage | closed |
| T-06-07 | Tampering (stealth-behavioral major) | resolvers/sonner/vaul/helmet/resizable + @vercel pair | mitigate | Atomic-per-major + resolver-form + sonner-toast operator smokes; every commit gated on `verify:baseline`. **Verified:** 06-03 `autonomous:false` smokes done | closed |
| T-06-08 | Tampering (control/gate integrity) | eslint set (eslint 9→10 + plugins + typescript-eslint) | mitigate | Moved as ONE coupled commit; `npm run lint` exit 0, warn-baseline intact, `no-explicit-any` not purged. **Verified:** eslint `^10` + plugins coherent; code review clean | closed |
| T-06-09 | Tampering (dependency-scope leak) | @hookform/resolvers 3→5 (zod 4 leak vector) | mitigate | Confirmed resolvers v5 `/zod` Standard-Schema supports zod 3.25+; gated on `type-check`; zod 4 NOT taken. **Verified:** `zod ^3.25.76` (deferred major held); resolvers `^5.4.0` | closed |
| T-06-10 | Tampering / Elevation (business-critical path) | @stripe/* + @supabase/supabase-js point releases | mitigate | Isolated as own grouped revert units; E2E Stripe-checkout + auth-persistence on the gate. **Verified:** isolated commits; auth-session + stripe:26 (clientSecret/iframe) GREEN. Post-checkout reconcile E2E leg (`stripe-checkout:56`) env-deferred — see Accepted Risk AR-06-02 | closed |
| T-06-11 | Tampering (accidental major via loose range) | minor/patch batches; pdfjs-dist | mitigate | Explicit minor-range installs, `npm outdated` `wanted` match, `pdfjs-dist` held 5.x. **Verified:** `pdfjs-dist ^5.7.284`; no deferred-framework major leaked (VERIFICATION SC-2) | closed |
| T-06-12 | Spoofing (typosquat on batch install) | grouped batch installs | mitigate | Only names already in `package.json` installed; no new package names introduced; `npm ci` integrity proven in 06-06 | closed |
| T-06-13 | Elevation (known vulnerability) | vite / react-router-dom advisories | mitigate | Exact fix versions + per-advisory `npm audit` re-check. **Verified:** `vite ^8.0.16`, `react-router-dom ^6.30.4`; GHSA-fx2h-pf6j-xcff / GHSA-v6wh-96g9-6wx3 / GHSA-2j2x-hqr9-3h42 cleared; audit 32→20 | closed |
| T-06-14 | Denial of Service (prod realtime) | `ws` override `8.20.1 → ^8.21.0` on @supabase/realtime-js | mitigate + accept | Cleared production-path HIGH GHSA-96hv-2xvq-fx4p (+engine.io/socket.io cascade); `npm ls ws` deduped to 8.21.0; gated on `verify:baseline`; one-line atomic revert. BLOCKING realtime checkpoint honored — operator explicitly DECIDED **ACCEPT (polling-backstop)** 2026-06-20; live websocket smoke env-deferred — see Accepted Risk AR-06-03 | closed |
| T-06-15 | Repudiation (audit hygiene / accepted-risk masking) | promptfoo dev subtree | accept | `npm audit fix --force` NEVER run; measure-then-bump; dev-only residue documented per-advisory in RESIDUAL-REGISTER, off-gate, zero prod exposure — see Accepted Risk AR-06-01 | closed |
| T-06-16 | Spoofing (typosquat on measured install) | promptfoo throwaway measure | mitigate | Installed exact known registry version `promptfoo@0.120.19` in a throwaway; under-delivered → DISCARDED (`git checkout`), residue kept rather than chasing unvetted tag | closed |
| T-06-17 | Tampering (lockfile not pinning integrity) | package-lock.json / root deno.lock relock | mitigate | Relock via `npm install` (writes SRI hashes) PROVEN by `npm ci` (hard-fails on lock/manifest drift, D-08). **Verified:** `rm -rf node_modules && npm ci` exit 0 (VERIFICATION SC-4) | closed |
| T-06-18 | Tampering (relock smuggling a version bump) | broad `npm install` relock | mitigate | Post-relock `git diff package.json` MUST be empty; lock diff reviewed; `npm outdated` confirms no deferred-framework major. **Verified:** both diffs empty at 06-06; no major leaked | closed |
| T-06-19 | Tampering (wrong/edge lock regen) | edge `supabase/functions/deno.lock` | mitigate | Only ROOT `deno.lock` regenerated (`deno install --lockfile-only` from repo root); edge lock intentionally absent (`deno.json lock:false`), edge consolidation stays DEFERRED (D-04). **Verified:** root deno.lock regenerated `b0f543a5`; edge lock absent | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-15 | **Dev-only `promptfoo` transitive `npm audit` residue (20 pkgs, 0 critical, 1 low/13 mod/6 high).** Entirely inside the dev-only `promptfoo` subtree, off the `verify:baseline` gate, zero production-runtime exposure. promptfoo measured-then-discarded (0.120.19 would have escalated protobufjs to CRITICAL); `--force` never run. Per-advisory IDs catalogued in `.planning/audit/RESIDUAL-REGISTER.md` (DEP-04 Accepted-Risk Residue). | Operator (Phase 06-05) | 2026-06-20 |
| AR-06-02 | T-06-10 | **Stripe post-checkout reconcile E2E leg (`stripe-checkout:56`, DI-06-04-01) env-deferred.** Blocked on the paused TEST Supabase project `cimjltzovkahkqecpwgi` — an environment block, not a code regression. The mitigated surface IS verified green: auth-persistence + `stripe:26` (clientSecret + EmbeddedCheckout iframe) pass on the gate. Re-run when the TEST project is unpaused. | Operator (Phase 06-04) | 2026-06-20 |
| AR-06-03 | T-06-14 | **Live realtime websocket smoke (DI-06-05-01) env-deferred; `ws@^8.21.0` override accepted low-risk.** Sole consumer `Results.tsx:409` is polling-backstopped (5s fallback DB poll); `ws 8.20→8.21` is a stable in-8.x security patch. Live smoke blocked on the same paused TEST Supabase project. Operator decision: ACCEPT polling-backstop. | Operator (Phase 06-05) | 2026-06-20 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-20 | 19 | 19 | 0 | gsd secure-phase (plan-time register, evidence-based verification against codebase + lockfiles + 06-DEP-CHANGES ledger + 06-VERIFICATION SC-1..5) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-20
