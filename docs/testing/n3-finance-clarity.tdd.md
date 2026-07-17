# N3 commitment and safe-to-spend clarity — TDD evidence

**Date:** 2026-07-17

**Source:** `docs/superpowers/specs/2026-07-17-n3-finance-clarity-product-brief.md`

## User journeys

1. As a user deciding whether to make a purchase, I want safe-to-spend based on my spending
   envelopes so planned Savings and Investments are never temporarily presented as disposable.
2. As a user logging a commitment transfer, I want safe-to-spend to remain unchanged because the
   commitment was already reserved in my monthly plan.
3. As a user reading the monthly summary, I want expenses plus commitments described as allocated
   money, while shared-budget expenses remain described as spent.

## Task report

| Stage | Execution summary | Command | Result |
| --- | --- | --- | --- |
| RED | Added dashboard and ring tests for commitment exclusion, custom envelope inclusion, and allocation copy. | `npm test -- src/components/BudgetUsageRing.test.tsx src/screens/Dashboard.test.tsx` | **FAIL as intended:** 3 failed, 16 passed. Safe-to-spend rendered S$38 instead of S$20 with a partial savings transfer and S$46 instead of S$24 with a custom envelope; the ring announced budget spent. |
| GREEN | Restored the spendable-envelope formula and commitment filter, then separated personal allocation copy from shared spending copy. | Same targeted command | **PASS:** 2 files / 19 tests. |
| Regression | Ran the complete unit/integration suite. | `npm test` | **PASS:** 67 files / 552 tests. |
| Quality | Checked static analysis and the production bundle. | `npm run lint`; `npm run build` | **PASS:** lint clean; TypeScript and Vite build complete. |
| Coverage | Ran the instrumented suite with bounded workers. | `npm run test:coverage -- --maxWorkers=4` | **PASS:** 67 files / 552 tests; all thresholds exceeded. |

## Test specification

| # | What is guaranteed | Test target | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | Savings and Investments entries do not consume the daily spending envelope. | `Dashboard.test.tsx: keeps commitments out of safe-to-spend and labels total usage as allocated` | Component | PASS |
| 2 | A budgeted custom category increases the daily spending envelope. | `Dashboard.test.tsx: adds budgeted custom categories to the safe-to-spend envelope` | Component | PASS |
| 3 | An unbudgeted custom category adds no envelope but its entries still reduce safe-to-spend. | `Dashboard.test.tsx: shows a no-budget custom category card with its spend` | Component | PASS |
| 4 | Personal usage is labelled allocated in visible and accessible summaries. | Dashboard commitment test; `BudgetUsageRing.test.tsx` | Component | PASS |
| 5 | Shared-budget usage retains spending language. | `Dashboard.test.tsx: shows the selected shared budget from the Home shared view` | Component | PASS |

## Coverage and known gaps

- Whole-project coverage: 85.09% statements, 77.75% branches, 84.09% functions, and 88.57% lines.
- No data migration is required; the change uses existing budget and entry categories.
- No browser visual check was run. The change affects formulas and short copy without altering layout.
- If configured envelopes do not sum to income, safe-to-spend follows the explicit spendable
  envelopes; the budget editor already warns about the mismatch.

## Merge evidence

- RED checkpoint: `8c1adab test: reproduce N3 commitment clarity regressions`
- GREEN checkpoint: `d107267 fix: restore commitment-aware safe-to-spend semantics`
