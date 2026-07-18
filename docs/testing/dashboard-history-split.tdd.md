# Dashboard and History maintainability split — TDD evidence

## Source

The scope came from the second locally actionable item in `docs/PROJECT_IMPROVEMENT_STATUS.md` and was normalized in `docs/superpowers/specs/2026-07-18-dashboard-history-split-design.md`.

## User journeys

- A user can inspect, expand, and delete personal or shared budget entries from Home.
- A user can search, filter, edit, delete, undo, and add transactions from History.

## Execution report

### RED

`npm test -- src/components/dashboard/BudgetPassStack.test.tsx src/components/history/HistoryLedgerFilters.test.tsx`

Both suites failed at import time because the components did not exist. This was the intended compile-time RED for the extraction contracts. Commit: `b53b464`.

### GREEN

`npm test -- src/components/dashboard/BudgetPassStack.test.tsx src/components/history/HistoryLedgerFilters.test.tsx src/screens/Dashboard.test.tsx src/screens/History.test.tsx`

Result: 4 files and 28 tests passed. The same command remained green after the ledger-row and calendar extractions. Commit: `c1b3726`.

### Full verification

- `npm run test:coverage` — 70 files and 559 tests passed.
- `npm run lint` — passed after moving the non-component `sourceLabel` helper into `historyEntryModel.ts`.
- `npm run typecheck:functions` — all three Deno Edge Function targets passed.
- `npm run build` — TypeScript and the Vite production build passed.
- `npm run test:e2e` — 12 mobile Chromium journeys passed, including History edit/delete/undo and accessibility checks.
- `npm run size` — initial JS 138.3 KiB gzip within 143 KiB; CSS 12.3 KiB gzip within 13 KiB.
- `npm audit --audit-level=high` — 0 vulnerabilities.

The browser suite emitted expected offline Supabase messages while exercising its network-isolated fixtures; the suite completed green.

## Test specification

| # | Guarantee | Test target | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | A capped pass leads with remaining money and preserves the allocated/spent label. | `BudgetPassStack.test.tsx` | Component | PASS |
| 2 | Overspending is presented as a positive over-budget amount. | `BudgetPassStack.test.tsx` | Component | PASS |
| 3 | A background shared pass remains keyboard/screen-reader selectable. | `BudgetPassStack.test.tsx` | Component | PASS |
| 4 | Search and filter controls publish controlled state and an accessible result count. | `HistoryLedgerFilters.test.tsx` | Component | PASS |
| 5 | Existing personal/shared Dashboard behavior is unchanged. | `Dashboard.test.tsx` | Integration | PASS |
| 6 | History search, filters, editing, duplicate, delete, undo, day selection, and empty states are unchanged. | `History.test.tsx` | Integration | PASS |
| 7 | Critical browser journeys and WCAG A/AA scans remain green. | `tests/e2e/` | E2E | PASS |

## Coverage and structure

Whole-project coverage is 85.46% statements, 78.08% branches, 84.76% functions, and 88.93% lines. The enforced thresholds were not lowered.

`Dashboard.tsx` decreased from 649 to 464 lines and `History.tsx` from 677 to 416 lines. Route-level state and persistence remain in the screens; pass rendering, shared-budget detail, ledger rows, controlled filters, and the spending calendar now live in focused components.

## Known gaps

This was a behavior-preserving refactor. It deliberately did not change calculations, storage, copy, CSS, navigation, or the N5 physical-device/Sentry verification backlog.
