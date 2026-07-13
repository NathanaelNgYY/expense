# Date Entry and History Day Sheet TDD Evidence

> Superseded on 2026-07-13 by the B-lite calendar-to-ledger flow documented in
> `date-entry-history-b-lite.tdd.md`. This file remains as historical evidence for the removed sheet.

## Source

Journeys were derived from the approved A + B mockup flow during this TDD run. No external plan file was used.

## User journeys

- A user can keep the default date as today without adding friction to normal entry.
- A user can select yesterday in one tap and see the non-today date in the save action.
- A user can select an older date with the native date picker, capped at today.
- A user reviewing the calendar can inspect a day's entries and total in a bottom sheet.
- A user can expand that sheet and add an expense with the selected calendar date locked.
- The old standalone History backfill card is removed.

## RED and GREEN evidence

| Stage | Command | Result | Evidence |
|---|---|---|---|
| RED | `npm test -- src/screens/AddEntry.test.tsx src/screens/History.test.tsx` | Expected failure | 4 new tests failed because the date selector and day sheet did not exist; 14 existing tests passed. |
| GREEN | `npm test -- src/screens/AddEntry.test.tsx src/screens/History.test.tsx` | PASS | 2 files passed, 18 tests passed. |
| Full regression | `npm test` | PASS | 51 files passed, 424 tests passed. |
| Final focused regression | `npm test -- src/screens/AddEntry.test.tsx src/screens/History.test.tsx` | PASS | 2 files passed, 18 tests passed after the short-phone CSS refinement. |
| Lint | `npm run lint` | PASS | ESLint completed with no errors or warnings. |
| Production build | `npm run build` | PASS | TypeScript build and Vite PWA production build completed successfully. |

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Add Entry defaults to Today and retains the normal Save label | `AddEntry.test.tsx: defaults to today and keeps the normal save label` | Component | PASS |
| 2 | Yesterday changes the action label and persists yesterday's local date | `AddEntry.test.tsx: saves an entry for yesterday and makes the non-today date visible` | Integration | PASS |
| 3 | The native date input is capped at today and supports older dates | `AddEntry.test.tsx: lets the native picker select an older date and caps it at today` | Component | PASS |
| 4 | Calendar selection opens a labelled dialog with only that day's entries and total | `History.test.tsx: opens a calendar day sheet and adds an expense with the selected date locked` | Integration | PASS |
| 5 | The sheet form persists amount, category, note, and the locked calendar date | Same History integration test | Integration | PASS |
| 6 | The legacy backfill card is absent and the disclosure is renamed | Same History integration test | Component | PASS |

## Browser QA

Local Vite QA used headless Chrome at 390x844 and 375x667.

- Today and Yesterday states render in the existing Carbon Ledger theme.
- Add Entry fits without scrolling at 390x844.
- The day sheet opens with focus on Close, closes on Escape, and restores focus to the selected day.
- The sheet and expanded form fit within the mobile viewport.
- The first 375x667 pass found Save partly behind the tab bar. The short-height rhythm was tightened and rechecked: screen `scrollHeight` equals `clientHeight` at 602px, and Save ends at 590px above the 602px tab-bar boundary.

The browser connector's Chrome extension was unavailable, so QA used the locally installed Playwright runtime with headless Chrome. One local resource returned 404 during the run; no production deployment or backend was exercised.

## Coverage and known gaps

The repository does not install `@vitest/coverage-v8` and has no coverage script, so no percentage is reported. The focused feature paths are covered by component and integration tests, but a numeric 80% threshold could not be measured without changing project dependencies.

## Merge evidence

- RED checkpoint: `12f0963 test: add date entry and history day sheet coverage`
- GREEN checkpoint: `f1af97a feat: add dated entry and history day sheet flow`
