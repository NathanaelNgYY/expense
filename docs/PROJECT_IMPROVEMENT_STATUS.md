# Project improvement status

**Last updated:** 2026-07-15

**Source:** the July 2026 production, finance, decision, audit, and productivity review.

**Purpose:** this is the live status companion to that point-in-time audit.

## Current position

The highest-risk identity, ingestion visibility, migration recovery, crash recovery, bulk-reset safety, month-analytics correctness, weekly-history correctness/accessibility, H6 presentation, M17 isolation/browser/accessibility, H11 batch imports, the first M14 bundle reduction, the five-tab navigation restructure, and first-run budget onboarding are implemented and deployed. M18 runtime retirement and H9 repository enforcement are complete. Automatic Tracking setup and direct past-date entry are complete. Time-based automatic categories are complete locally and awaiting database/Edge Function review and deployment.

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
| H9 — CI | Complete | GitHub Actions runs lint, Deno typecheck of the ingest Edge Function, tests with enforced coverage thresholds, build, an initial-bundle size budget, a blocking high-severity dependency audit, and a gitleaks history scan — on pushes, pull requests, and a weekly schedule. Static regression coverage prevents the audit gate or the verify/RLS/E2E jobs from being silently removed. After the repository became public, `main` branch protection was enabled with strict required `verify`, `rls`, and `e2e` checks and administrator enforcement. | `.github/workflows/ci.yml`, `src/ciWorkflow.test.ts`, `docs/testing/h9-ci-enforcement.tdd.md` |
| M17 — live isolation, browser E2E, and accessibility | Complete and deployed | Live Postgres proves isolation across 9 tables and 2 SECURITY DEFINER RPCs. Mobile Chromium covers four critical journeys, page headings, keyboard focus, named controls, 44px targets, and Axe WCAG A/AA scans in parallel CI jobs. The deployed weekly History rows were also checked successfully with VoiceOver on a physical iPhone on 2026-07-14. | `supabase/tests/rls/`, `tests/e2e/`, `docs/testing/m17-browser-e2e.tdd.md`, `.github/workflows/ci.yml` |
| H10 — unpushed work | Complete | Earlier work, live RLS tests, database-advisor improvements, and H6 are merged and deployed. | `git status --branch` |
| M10 — no identity linking | Complete | Google identity linking is implemented as part of C1. | `src/sharedBudgets/sharedApi.ts` |
| M18 — retire stale backend architecture | Complete | The retired function runtime, configuration, tests, and packages are deleted; Blobs-era reconciliation is removed; current guidance and the live ingest test are Supabase-only; `verify_jwt = false` is committed for the custom-token ingest contract. | `docs/testing/m18-netlify-retirement.tdd.md`, `src/m18NetlifyCleanup.test.ts`, `supabase/config.toml` |
| H11 — row-at-a-time CSV imports | Complete and deployed | CSV rows are fully parsed and validated before writes, duplicate ids are removed against both existing entries and the same file, and new rows use one bulk upsert followed by one context refresh. | `docs/testing/h11-csv-batch-m14.tdd.md`, `src/csvEntries.test.ts`, `src/EntriesContext.test.tsx`, `src/screens/settings/DataSettings.test.tsx` |
| M14 — initial bundle performance | Materially improved, deployed, and reassessed | Sentry now loads through a tree-shaken dynamic boundary, removing it from the first-render path while preserving early error capture. Initial JavaScript fell from 164.2 to 137.2 KiB gzip (−27.0 KiB / 16.4%); the CI budget tightened from 172 to 143 KiB. Three-run production Lighthouse medians are mobile 94 / LCP 2.505s / CLS 0 / TBT 121ms and desktop 100 / LCP 0.617s / CLS 0 / TBT 0ms. The borderline mobile result is within run-to-run noise, so another identity/sync loading refactor is deferred until field data shows a sustained problem. | `docs/testing/m14-bundle-reduction.tdd.md`, `docs/testing/m14-production-cwv-2026-07-15.md`, `src/monitoring.ts`, `src/monitoringSentry.ts`, `scripts/check-bundle-size.mjs` |
| H4–H5 — weekly-history correctness and accessibility | Complete and deployed | Weekly total and lunch targets are prorated by selected-month days instead of dividing by four; boundary rows exclude adjacent-month entries; every weekly chart group exposes exact spend-versus-target text to assistive technology. The presentation now lives on Insights. | `docs/testing/h4-h5-weekly-history.tdd.md`, `src/compute.ts`, `src/screens/Insights.tsx` |
| Automatic tracking onboarding | Complete | Settings now provides a three-step Apple Pay and DBS-alert setup flow, explains the native PayNow limitation and manual fallback, copies the public Edge Function endpoint, links to trusted token provisioning and Shortcuts, and refreshes the linked-account/last-capture status without exposing raw tokens to the browser. | `docs/testing/automatic-tracking-setup.tdd.md`, `src/screens/settings/AutomaticCaptureSettings.tsx`, `src/screens/settings/IngestStatusCard.tsx` |
| Direct past-date entry | Complete | Add now exposes a labelled native date picker that defaults to today, prevents future dates, accepts a past date directly or from History’s calendar shortcut, and preserves the existing optimistic save/undo path. Its interactive surface measures 44px at 375×667 without horizontal overflow. | `docs/testing/add-entry-date.tdd.md`, `src/screens/AddEntry.tsx`, `tests/e2e/journeys.spec.ts` |
| Five-tab navigation restructure | Complete and deployed | Primary navigation is now Home, History, Add, Insights, and Settings. History retains the transaction ledger and calendar; category, weekly, and monthly pattern analysis has a dedicated lazy screen. Poker and Shared budgets remain available under Settings → More tools while the Settings tab stays selected. | `docs/testing/navigation-restructure.tdd.md`, `src/components/TabBar.tsx`, `src/screens/Insights.tsx`, `src/screens/Settings.tsx` |
| First-run budget onboarding | Complete and deployed | Fresh installs now open a compact welcome, can accept defaults or edit monthly envelope targets, see the computed Buffer, and finish into Add or Home. Existing users and direct Add launches are not interrupted; completion is user-scoped. | `docs/testing/first-run-budget-onboarding.tdd.md`, `src/onboarding/FirstRunBudgetOnboarding.tsx`, `src/onboarding/onboardingState.ts` |
| Time-based automatic categories | Complete locally | Automatic Tracking can route recognized food merchants into SGT meal windows targeting any built-in or custom category. Same-window merchant corrections remain strongest; transport/unknown merchants are unaffected; preferences are user-owned and capture degrades safely if preference loading fails. | `docs/testing/time-based-auto-categories.tdd.md`, `src/shared/automaticCategoryRules.ts`, `src/screens/settings/MealTimeRulesSettings.tsx`, `supabase/migrations/20260715060749_automatic_category_preferences.sql` |

## Next recommended work

1. Run the new automatic-category RLS test, apply the preferences migration, deploy ingest then the PWA, and verify one Lunch and one Dinner capture on a physical iPhone.
2. Collect CrUX/real-user Core Web Vitals once the site has available field data; reopen M14 only if mobile LCP or INP fails consistently.
3. Select the next product/audit item from M1–M9 or M12–M16.

## Remaining audit items

- M1–M9 and M12–M16, except where a later implementation or product decision explicitly retires an item.
- C3's perfect Apple Pay dedupe guarantee remains impossible without a stable transaction identifier from iOS; the current fallback is deliberately documented rather than overstated.

## Verification baseline

- Current suite: 59 test files, 502 tests passed.
- Lint and production build pass.
- Whole-project coverage: 84.50% statements, 77.34% branches, 83.14% functions, 88.09% lines. The existing CI thresholds remain enforced and were not lowered.
- Live RLS: 48 isolation tests across 9 tables and 2 SECURITY DEFINER RPCs pass against a real Postgres locally and in the parallel `rls` CI job. These replaced `supabase/tests/ingest_visibility.test.ts`, which asserted that migration files *contained* policy substrings and would have stayed green if a policy were later dropped.
- Browser E2E: 10 mobile Chromium checks pass across seven critical journeys, Axe WCAG A/AA scans on all primary screens and Settings tools, keyboard focus, accessible names, measured 44px targets, and no-overflow checks at 375×667 and 390×844. They run in a parallel `e2e` CI job without contacting deployed Supabase.
- Physical accessibility: the deployed weekly History rows passed an iPhone VoiceOver check on 2026-07-14.
- Initial payload check: 137.0 KiB gzip JavaScript and 12.0 KiB gzip CSS, against tightened CI budgets of 143 and 12. JavaScript includes the entry file plus eagerly preloaded React and Supabase chunks; Sentry, onboarding, Insights, and other lazy route chunks are excluded from the ordinary returning-user first-render path. Automatic Tracking and its 0.87 KiB gzip meal-rule stylesheet remain inside the lazy Settings chunk.
- Production performance lab baseline (three-run Lighthouse 13 medians): mobile score 94, FCP 1.934s, LCP 2.505s, TBT 121ms, CLS 0; desktop score 100, FCP 0.390s, LCP 0.617s, TBT 0ms, CLS 0. INP requires field/interaction data and was not inferred from TBT.
- `deno check` of the ingest Edge Function passes. It previously did not: `IngestInput.learnedCategory` was typed `Category` while `categoryFromHistory` returns `string | null` (custom categories), and nothing typechecked `supabase/functions/`, so CI never saw it.
- gitleaks: 218 commits scanned, no leaks.
- Targeted H7 coverage: 95.1% statements, 82.55% branches, 93.61% functions, 98.72% lines.
- Targeted H1–H3 coverage: 97.09% statements, 80.29% branches, 98.33% functions, 99.27% lines.
- Dependency audit reports 0 vulnerabilities after retiring 49 legacy packages and refreshing patched transitive versions.
