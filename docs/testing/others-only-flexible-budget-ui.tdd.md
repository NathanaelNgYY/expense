# Others-only flexible budget UI — TDD evidence

**Date:** 2026-07-18

**Source:** User journeys were derived during this TDD run from the decision to remove the
redundant Buffer UI and use the existing Others category as the single visible flexible budget.

## User journeys

1. As a user reviewing my budget, I want one flexible-budget row, so the same money is not shown twice.
2. As a user configuring or onboarding my budget, I want that flexible category called Others everywhere.
3. As an existing user, I want old saved configurations and overage calculations to remain compatible.

## Task report

| Stage | Execution summary | Command | Result |
| --- | --- | --- | --- |
| RED | Added component and browser assertions for an Others-only UI across Dashboard, Budget Settings, and onboarding. | `npm test -- src/screens/Dashboard.test.tsx src/screens/settings/BudgetSettings.test.tsx src/onboarding/FirstRunBudgetOnboarding.test.tsx` | **FAIL as intended:** 4 failed, 32 passed. The UI still rendered the Buffer card/copy and had no `budget-others` settings field. |
| GREEN | Removed the standalone card, moved the true flexible balance into Others, and replaced user-facing Buffer fields/copy with Others while synchronizing compatibility values. | Same focused Vitest command | **PASS:** 3 files, 36 tests. |
| Browser | Exercised the updated Others journey in the mobile Chromium project. | `npx playwright test tests/e2e/journeys.spec.ts --grep "Others is the only flexible-budget UI"` | **PASS:** 1 test. The mocked/offline run logged an expected Supabase fetch failure without affecting the journey. |
| Quality | Checked static analysis and the production bundle. | `npm run lint`; `npm run build` | **PASS:** lint clean; TypeScript and Vite production build complete. |

## Test specification

| # | What is guaranteed | Test target | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | The Dashboard has no standalone Buffer card or Buffer label. | `Dashboard.test.tsx: presents Others as the only flexible-budget UI` | Component | PASS |
| 2 | Others shows the flexible balance after its own spending and overages from another category. | Same Dashboard test | Component | PASS |
| 3 | An exhausted flexible budget reports its overage on Others without a second card. | `Dashboard.test.tsx: shows an exhausted flexible budget on Others without a second card` | Component | PASS |
| 4 | Budget Settings shows an editable Others field, no Buffer field, and saves matching `others`/`buffer` compatibility values. | `BudgetSettings.test.tsx: shows Others instead of Buffer and keeps its compatibility values synchronized` | Component | PASS |
| 5 | First-run setup calls the automatically calculated flexible category Others, not Buffer. | `FirstRunBudgetOnboarding.test.tsx` | Component | PASS |
| 6 | The behavior renders correctly in the mobile browser journey. | `journeys.spec.ts: Others is the only flexible-budget UI` | E2E | PASS |

## Coverage and known gaps

- `npm run test:coverage` reached 552 passing tests out of 553, but did not produce a final
  coverage report because the unrelated Settings reset/undo test exceeded its own polling deadline
  under coverage instrumentation. That test passes normally in isolation: 12/12 Settings hub tests.
- A focused instrumented run passed all 36 changed-surface tests, then exited non-zero because the
  repository's global thresholds apply to all source files even when only three test files run.
  Its whole-source partial figures (45.25% statements, 36.06% branches, 51.84% functions, 49.09%
  lines) are therefore not a measure of coverage for this change.
- The internal `BudgetConfig.buffer` field and `bufferRemaining` function intentionally remain for
  saved-data compatibility. They no longer create a separate user-facing allocation.

## Merge evidence

- RED checkpoint: `99ad7c4 test: reproduce redundant Buffer UI`
- GREEN checkpoint: `14d8fa9 fix: consolidate flexible budget UI into Others`
- Refactor checkpoint: `bbc5061 refactor: align dashboard naming with Others model` (Dashboard test: 17/17 pass.)
