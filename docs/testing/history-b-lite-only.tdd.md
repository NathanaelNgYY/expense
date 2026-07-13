# History B-lite Only TDD Evidence

## Source

Journeys were derived from the user's explicit correction: “I don't want A, I just want B-lite.” No external plan file was used.

## User journeys

- Normal Add Entry remains the original numpad flow with no date chooser.
- A calendar tap filters History to the selected day's existing entries.
- “Add for [date]” opens the unchanged numpad with the History date locked internally.
- The dated save label makes that locked date visible without adding Option A controls.

## Task report

| Stage | Command or check | Result | Evidence |
|---|---|---|---|
| RED | `npm test -- src/screens/AddEntry.test.tsx` | Expected failure | 2 tests failed because normal and History-launched Add Entry still rendered the Option A date chooser; 10 tests passed. |
| GREEN | `npm test -- src/screens/AddEntry.test.tsx src/screens/History.test.tsx src/App.test.tsx` | PASS | 3 files and 20 tests passed. |
| Regression | `npm test` | PASS | 51 files and 423 tests passed. |
| Static checks | `npm run lint` | PASS | ESLint completed with no errors. |
| Production build | `npm run build` | PASS | TypeScript and Vite completed; the PWA generated 18 precache entries. |
| Mobile browser QA | Playwright CLI at `390 × 844` | PASS | Normal Add had zero date controls; History filtered to 2 rows; no dialog appeared; the dated handoff retained “Add for Jul 12”; no horizontal overflow occurred. |

## Test specification

| # | What is guaranteed | Test or check | Type | Result |
|---|---|---|---|---|
| 1 | Normal Add Entry exposes no date chooser or Yesterday action | `AddEntry.test.tsx: keeps the normal add flow free of date controls` | Component | PASS |
| 2 | A History-selected date is used when the expense is saved | `AddEntry.test.tsx: uses a date selected from History without exposing Option A controls` | Integration | PASS |
| 3 | Calendar selection filters the ledger and exposes the dated add action | `History.test.tsx: filters the ledger to a tapped calendar day and offers dated entry` | Integration | PASS |
| 4 | The B-lite handoff has no dialog, date chooser, or viewport overflow | Playwright mobile QA | E2E | PASS |

## Coverage and known gaps

- The repository has no `test:coverage` script, so no percentage was claimed.
- The complete 423-test suite passed.
- Browser QA intentionally blocked Supabase requests so seeded local entries stayed deterministic; those expected network errors were excluded from the UI verdict.
- No committed visual baseline exists, so pixel-regression comparison remains inconclusive; the regenerated B-lite-only board was inspected directly.

## Merge evidence

- RED checkpoint: `814a1f6 test: reject option a date controls from add entry`
- GREEN checkpoint: `4f77606 feat: keep only the history b-lite backfill flow`
