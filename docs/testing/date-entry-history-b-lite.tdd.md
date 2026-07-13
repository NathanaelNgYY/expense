# Date Entry and History B-lite TDD Evidence

> Superseded on 2026-07-13 by `history-b-lite-only.tdd.md`, which removes Option A's
> Today/Yesterday/date-picker controls and keeps only the calendar-led B-lite flow.

## Source

Journeys were derived from the user's correction that the implemented bottom-sheet flow should be B-lite. No external plan file was used.

## User journeys

- A user reviewing the calendar can tap a day and see only that day's ledger entries.
- The selected day is visible above the ledger with a clear action and an “Add for [date]” action.
- Adding from the filtered ledger reuses the existing Add Entry numpad with the calendar date preselected.
- Clearing the day filter restores the full month ledger.
- No modal or bottom-sheet primitive remains in the History flow.

## Task report

| Stage | Command or check | Result | Evidence |
|---|---|---|---|
| RED | `npm test -- src/screens/History.test.tsx src/screens/AddEntry.test.tsx` | Expected failure | 2 new tests failed: History still rendered the day-sheet dialog and Add Entry still defaulted to Today; 17 existing tests passed. |
| GREEN | `npm test -- src/screens/History.test.tsx src/screens/AddEntry.test.tsx src/App.test.tsx` | PASS | 3 files and 22 tests passed after the B-lite implementation. |
| Regression | `npm test` | PASS | 51 files and 425 tests passed. |
| Static checks | `npm run lint` | PASS | ESLint completed with no errors. |
| Production build | `npm run build` | PASS | TypeScript and Vite completed; the PWA generated 18 precache entries. |
| Mobile browser QA | Playwright CLI at `390 × 844` | PASS for interaction and layout | Tapping Jul 12 showed 2 ledger rows, no dialog, no horizontal overflow, a 12px gap between day bar and filters, and handed Jul 12 to Add Entry. |

## Test specification

| # | What is guaranteed | Test file or check | Type | Result |
|---|---|---|---|---|
| 1 | A calendar tap filters the ledger to the exact selected date | `History.test.tsx: filters the ledger to a tapped calendar day and offers dated entry` | Integration | PASS |
| 2 | The selected-day action passes the ISO date to the Add Entry handoff | Same History test | Integration | PASS |
| 3 | Clearing the day filter restores every monthly entry | Same History test | Integration | PASS |
| 4 | Add Entry initializes its date pill and save label from History | `AddEntry.test.tsx: starts on a date selected from History` | Component | PASS |
| 5 | The old day-sheet dialog is absent | History integration test and browser check | Integration / E2E | PASS |
| 6 | The 390px layout has no horizontal overflow or control overlap | Playwright bounding-box and viewport checks | E2E | PASS |

## Coverage and known gaps

- The repository does not define a `test:coverage` script, so no new percentage was claimed.
- The full 425-test suite passed with no skipped-test evidence in the runner summary.
- Browser QA used an intentionally offline Supabase route so seeded local entries could remain stable. The resulting network console errors were expected test-fixture noise.
- There is no committed visual baseline, so visual-regression comparison is inconclusive; direct layout and interaction checks passed.

## Merge evidence

- RED checkpoint: `6783d8a test: require calendar day filter and dated add handoff`
- GREEN checkpoint: `fb0aed3 feat: replace history day sheet with day filter flow`
- The bottom-sheet component and its CSS were deleted in the GREEN checkpoint.
