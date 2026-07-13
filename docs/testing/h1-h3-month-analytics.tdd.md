# H1–H3 month analytics — TDD evidence

## Source and journeys

Journeys were derived from H1, H2, and H3 in the July 2026 project improvement audit:

- As a user, I want Highest day to include every transaction category so it reflects my true largest spending day.
- As a user, I want custom categories to be eligible for Most expensive so the insight matches my category setup.
- As a user reviewing a month, I want Day pattern to use only that selected month so the result changes with the month.

## RED and GREEN

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED | `npm test -- src/compute.test.ts src/components/InsightsSection.test.tsx` | Expected failure | 4 failed, 54 passed: total-day aggregation, custom-category ranking, month scoping, and UI plumbing were missing. Commit `16b5a0d`. |
| GREEN | `npm test -- src/compute.test.ts src/components/InsightsSection.test.tsx` | PASS | 58 passed after the minimal production fix. Commit `59ebcf8`. |
| Coverage refinement | `npx vitest run src/compute.test.ts src/components/InsightsSection.test.tsx --coverage --coverage.include=src/compute.ts --coverage.include=src/components/InsightsSection.tsx` | PASS | 61 passed; 97.09% statements, 80.29% branches, 98.33% functions, 99.27% lines. |

Full verification: `npm test` passed 57 files and 482 tests; `npm run lint` passed; `npm run build` passed with the existing bundle-size warning.

## Guarantees

| # | What is guaranteed | Test | Type |
| --- | --- | --- | --- |
| 1 | Highest day sums lunch, transport, commitments, custom, and uncategorized entries rather than silently filtering to lunch. | `compute.test.ts: uses total spend across every category for the highest spending day` | Unit |
| 2 | A custom category can win Most expensive and renders with its configured label. | `compute.test.ts: includes custom categories...`; `InsightsSection.test.tsx: renders a custom category...` | Unit + component |
| 3 | Day pattern ignores entries outside the selected year and month. | `compute.test.ts: uses only entries from the selected month` | Unit |
| 4 | Month Review visibly renders the corrected total-day and month-scoped weekday results. | `InsightsSection.test.tsx: renders total highest-day spend and a weekday pattern scoped to the selected month` | Component |
| 5 | The existing 15-entry confidence threshold still shows correct zero-data and singular remaining-count copy. | `InsightsSection.test.tsx` low-data tests | Component |

## Known boundaries

- Most expensive continues to exclude Savings and Investments by product design; custom categories are treated as spending categories.
- Day pattern still requires spending across at least three distinct weekdays before it appears.
- The existing initial-bundle size warning remains unrelated to these calculations.
