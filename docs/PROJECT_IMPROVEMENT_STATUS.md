# Project improvement status

**Last updated:** 2026-07-13

**Source:** the July 2026 production, finance, decision, audit, and productivity review.

**Purpose:** this is the live status companion to that point-in-time audit.

## Current position

The highest-risk identity, ingestion visibility, migration recovery, crash recovery, bulk-reset safety, and month-analytics correctness work is implemented. H8 is live in production. H7, H1–H3, and the documentation cleanup are complete locally but are not pushed or deployed yet.

## Completed or materially addressed

| Item | Status | What changed | Evidence |
| --- | --- | --- | --- |
| C1 — cross-user contamination | Complete | Storage namespaces are user-scoped, account transitions do not inherit another user's cache, and anonymous accounts can link Google identity in place. | `docs/testing/identity-isolation.tdd.md` |
| C2 — ingest account visibility | Complete | Settings shows the receiving account and last capture, and warns when the app and Shortcut accounts differ. | `docs/testing/ingest-visibility.tdd.md` |
| C3 — duplicate ingestion | Mitigated with an iOS limitation | Stable external idempotency keys are honored; DBS mail uses a stable body fingerprint; Apple Pay uses a one-minute merchant/amount fallback because Wallet Shortcuts expose no documented stable transaction id. | `docs/testing/ingest-idempotency.tdd.md`, `README.md` |
| C4 — migration dead end | Complete | Dedupe collisions recover deterministically, incomplete uploads remain recoverable, and migration failures no longer masquerade as offline errors. | `docs/testing/migration-recovery.tdd.md` |
| H7 — bulk month reset | Complete locally | Confirmation shows the affected count; Undo restores all entries with original ids and dedupe keys; restore clears stale tombstones. | `docs/testing/h7-bulk-reset-undo.tdd.md` |
| H8 / M11 — blank crashes and no monitoring | Complete and deployed | Root error fallback offers Reload and backup; production errors report to the EU Sentry project with source maps. A controlled event was received as `BUDGET-TRACKER-1`. | `docs/testing/error-boundary.tdd.md`, `docs/testing/sentry-monitoring.tdd.md`, `docs/SENTRY.md` |
| H1–H3 — incorrect month analytics | Complete locally | Highest day uses total daily spend, custom categories can rank as Most expensive, and Day pattern is scoped to the selected month. | `docs/testing/h1-h3-month-analytics.tdd.md` |
| H9 — CI | Partially complete | GitHub Actions runs lint, Deno typecheck of the ingest Edge Function, tests with enforced coverage thresholds, build, an initial-bundle size budget, `npm audit` (non-blocking), and a gitleaks history scan — on pushes, pull requests, and a weekly schedule. Required checks still cannot be enforced on this private repository's current GitHub plan. | `.github/workflows/ci.yml`, `scripts/check-bundle-size.mjs` |
| H10 — unpushed work | Reopened | Earlier work was pushed, but H7 and this documentation cleanup are currently local commits. Push after review. | `git status --branch` |
| M10 — no identity linking | Complete | Google identity linking is implemented as part of C1. | `src/sharedBudgets/sharedApi.ts` |
| M18 — stale architecture docs | Partially complete | README now describes Vercel, Supabase, the production URL, and the current Shortcut contract. Frozen Netlify function code remains as a fallback and should be removed only in a separate code-cleanup change. | `README.md`, `AGENTS.md` |

## Next recommended work

1. Push and deploy H7, H1–H3, and the documentation cleanup; verify Month Review and Undo on the production PWA.
2. Resolve H6: stop presenting Others and Buffer as the same money twice.
3. Add M17 browser E2E, accessibility checks, and automated live RLS isolation tests.
4. Address H11/M14 performance: batch CSV imports and reduce the initial bundle.

## Remaining audit items

- H4–H6, H9 enforcement, H11.
- M1–M9 and M12–M17, except where a later implementation or product decision explicitly retires an item.
- C3's perfect Apple Pay dedupe guarantee remains impossible without a stable transaction identifier from iOS; the current fallback is deliberately documented rather than overstated.

## Verification baseline

- Current suite: 57 test files, 482 tests passed.
- Lint and production build pass.
- Whole-project coverage: 84.44% statements, 76.66% branches, 82.94% functions, 87.99% lines. These are now enforced as CI thresholds and may only be raised.
- Initial payload: 159.6 KiB gzip entry JS, 11.2 KiB gzip CSS, against CI budgets of 166 and 12.
- `deno check` of the ingest Edge Function passes. It previously did not: `IngestInput.learnedCategory` was typed `Category` while `categoryFromHistory` returns `string | null` (custom categories), and nothing typechecked `supabase/functions/`, so CI never saw it.
- gitleaks: 218 commits scanned, no leaks.
- Targeted H7 coverage: 95.1% statements, 82.55% branches, 93.61% functions, 98.72% lines.
- Targeted H1–H3 coverage: 97.09% statements, 80.29% branches, 98.33% functions, 99.27% lines.
- Dependency audit still reports 10 existing findings: 1 low, 7 moderate, 2 high.
