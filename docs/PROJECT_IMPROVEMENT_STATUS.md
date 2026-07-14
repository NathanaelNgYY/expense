# Project improvement status

**Last updated:** 2026-07-14

**Source:** the July 2026 production, finance, decision, audit, and productivity review.

**Purpose:** this is the live status companion to that point-in-time audit.

## Current position

The highest-risk identity, ingestion visibility, migration recovery, crash recovery, bulk-reset safety, month-analytics correctness, H6 presentation, and M17 isolation/browser/accessibility work is implemented and deployed. M18 runtime retirement is complete. H11 batch CSV imports are implemented locally, and M14 has been remeasured against the browser's full eager payload.

## Completed or materially addressed

| Item | Status | What changed | Evidence |
| --- | --- | --- | --- |
| C1 — cross-user contamination | Complete | Storage namespaces are user-scoped, account transitions do not inherit another user's cache, and anonymous accounts can link Google identity in place. | `docs/testing/identity-isolation.tdd.md` |
| C2 — ingest account visibility | Complete | Settings shows the receiving account and last capture, and warns when the app and Shortcut accounts differ. | `docs/testing/ingest-visibility.tdd.md` |
| C3 — duplicate ingestion | Mitigated with an iOS limitation | Stable external idempotency keys are honored; DBS mail uses a stable body fingerprint; Apple Pay uses a one-minute merchant/amount fallback because Wallet Shortcuts expose no documented stable transaction id. | `docs/testing/ingest-idempotency.tdd.md`, `README.md` |
| C4 — migration dead end | Complete | Dedupe collisions recover deterministically, incomplete uploads remain recoverable, and migration failures no longer masquerade as offline errors. | `docs/testing/migration-recovery.tdd.md` |
| H7 — bulk month reset | Complete and deployed | Confirmation shows the affected count; Undo restores all entries with original ids and dedupe keys without waiting for the network. | `docs/testing/h7-bulk-reset-undo.tdd.md` |
| H8 / M11 — blank crashes and no monitoring | Complete and deployed | Root error fallback offers Reload and backup; production errors report to the EU Sentry project with source maps. A controlled event was received as `BUDGET-TRACKER-1`. | `docs/testing/error-boundary.tdd.md`, `docs/testing/sentry-monitoring.tdd.md`, `docs/SENTRY.md` |
| H1–H3 — incorrect month analytics | Complete and deployed | Highest day uses total daily spend, custom categories can rank as Most expensive, and Day pattern is scoped to the selected month. | `docs/testing/h1-h3-month-analytics.tdd.md` |
| H6 — Others and Buffer present the same money twice | Complete and deployed | Others remains a transaction category but now identifies its spending as coming from the single monthly Buffer; only Buffer reports exhaustion or overage. | `docs/testing/h6-others-buffer.tdd.md` |
| H9 — CI | Partially complete | GitHub Actions runs lint, Deno typecheck of the ingest Edge Function, tests with enforced coverage thresholds, build, an initial-bundle size budget, `npm audit` (non-blocking), and a gitleaks history scan — on pushes, pull requests, and a weekly schedule. Required checks still cannot be enforced on this private repository's current GitHub plan. | `.github/workflows/ci.yml`, `scripts/check-bundle-size.mjs` |
| M17 — live isolation, browser E2E, and accessibility | Complete and deployed | Live Postgres proves isolation across 9 tables and 2 SECURITY DEFINER RPCs. Mobile Chromium covers four critical journeys, page headings, keyboard focus, named controls, 44px targets, and Axe WCAG A/AA scans in parallel CI jobs. | `supabase/tests/rls/`, `tests/e2e/`, `docs/testing/m17-browser-e2e.tdd.md`, `.github/workflows/ci.yml` |
| H10 — unpushed work | Complete | Earlier work, live RLS tests, database-advisor improvements, and H6 are merged and deployed. | `git status --branch` |
| M10 — no identity linking | Complete | Google identity linking is implemented as part of C1. | `src/sharedBudgets/sharedApi.ts` |
| M18 — retire stale backend architecture | Complete | The retired function runtime, configuration, tests, and packages are deleted; Blobs-era reconciliation is removed; current guidance and the live ingest test are Supabase-only; `verify_jwt = false` is committed for the custom-token ingest contract. | `docs/testing/m18-netlify-retirement.tdd.md`, `src/m18NetlifyCleanup.test.ts`, `supabase/config.toml` |
| H11 — row-at-a-time CSV imports | Complete locally | CSV rows are fully parsed and validated before writes, duplicate ids are removed against both existing entries and the same file, and new rows use one bulk upsert followed by one context refresh. | `docs/testing/h11-csv-batch-m14.tdd.md`, `src/csvEntries.test.ts`, `src/EntriesContext.test.tsx`, `src/screens/settings/DataSettings.test.tsx` |
| M14 — initial bundle performance | Reassessed; reduction remains | The size gate now counts the entry module and eager `modulepreload` dependencies from built HTML. The honest initial payload is 164.2 KiB gzip JS plus 11.2 KiB CSS; lazy History, Settings, Poker, and Shared routes remain excluded. | `scripts/check-bundle-size.mjs`, `scripts/bundle-size.test.ts`, `docs/testing/h11-csv-batch-m14.tdd.md` |

## Next recommended work

1. Review and deploy the H11 CSV batching and corrected M14 size gate.
2. Continue M14 reduction using the 164.2 KiB eager-JS baseline; Supabase is intentionally eager because entries sync starts at app launch, so prioritize optional entry-path dependencies before deferring data sync.

## Remaining audit items

- H4–H5 and H9 enforcement.
- M1–M9 and M12–M16, except where a later implementation or product decision explicitly retires an item.
- C3's perfect Apple Pay dedupe guarantee remains impossible without a stable transaction identifier from iOS; the current fallback is deliberately documented rather than overstated.

## Verification baseline

- Current suite: 53 test files, 457 tests passed.
- Lint and production build pass.
- Whole-project coverage: 84.61% statements, 77.03% branches, 83.21% functions, 88.23% lines. The existing CI thresholds remain enforced and were not lowered.
- Live RLS: 48 isolation tests across 9 tables and 2 SECURITY DEFINER RPCs pass against a real Postgres locally and in the parallel `rls` CI job. These replaced `supabase/tests/ingest_visibility.test.ts`, which asserted that migration files *contained* policy substrings and would have stayed green if a policy were later dropped.
- Browser E2E: 7 mobile Chromium checks pass across four critical journeys, Axe WCAG A/AA scans, keyboard focus, accessible names, and measured 44px targets. They run in a parallel `e2e` CI job without contacting deployed Supabase.
- Initial payload check: 164.2 KiB gzip JavaScript and 11.2 KiB gzip CSS, against CI budgets of 172 and 12. JavaScript includes the entry file plus the eagerly preloaded date-format and Supabase chunks; lazy route chunks are excluded.
- `deno check` of the ingest Edge Function passes. It previously did not: `IngestInput.learnedCategory` was typed `Category` while `categoryFromHistory` returns `string | null` (custom categories), and nothing typechecked `supabase/functions/`, so CI never saw it.
- gitleaks: 218 commits scanned, no leaks.
- Targeted H7 coverage: 95.1% statements, 82.55% branches, 93.61% functions, 98.72% lines.
- Targeted H1–H3 coverage: 97.09% statements, 80.29% branches, 98.33% functions, 99.27% lines.
- Dependency audit reports 0 vulnerabilities after retiring 49 legacy packages and refreshing patched transitive versions.
