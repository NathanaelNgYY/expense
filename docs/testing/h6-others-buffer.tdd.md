# H6 Others / Buffer presentation — TDD evidence

**Date:** 2026-07-14

**Source:** User journeys were derived during this TDD run from H6 in
`docs/PROJECT_IMPROVEMENT_STATUS.md` and the agreed product model: Buffer is the
single flexible money pool, while Others remains a transaction category funded
by that pool.

## User journeys

1. As a user reviewing category spending, I want Others to say that its spend
   comes from Buffer, so I do not mistake the same money for two allocations.
2. As a user who has exhausted Buffer through Others spending, I want the
   overage reported by Buffer only, so the dashboard does not claim two
   independent shortfalls.
3. As an existing user, I want my stored budget configuration and calculations
   to keep working without migration.

## Task report

| Stage | Execution summary | Command | Result |
| --- | --- | --- | --- |
| RED | Added two Dashboard tests that reject the duplicated Others balance and category overage. | `npm test -- src/screens/Dashboard.test.tsx` | **FAIL as intended:** 2 failed, 13 passed. Current UI rendered `S$136.00 left / Budget S$236` for S$100 Others spend and a separate `S$64.00 over` for S$300 spend. |
| GREEN | Changed only the Others presentation: its status says `spent from Buffer`, its footer says `Uses monthly Buffer`, its progress uses Buffer capacity, and exhaustion is styled through the Buffer state. | `npm test -- src/screens/Dashboard.test.tsx` | **PASS:** 15 passed. |
| Regression | Ran the full project gates. | `npm run test:coverage`; `npm run lint`; `npm run build` | **PASS:** 56 files / 479 tests; lint clean; production build complete. |

## Test specification

| # | What is guaranteed | Test target | Type | Result |
| --- | --- | --- | --- | --- |
| 1 | S$100 of Others spending is described as spending from Buffer, not as an independent `S$136 left / Budget S$236` allocation. | `Dashboard.test.tsx: presents Others spending as usage of the single monthly Buffer` | Component | PASS |
| 2 | S$300 of Others spending does not create a separate Others overage; the S$64 overage appears on Buffer only. | `Dashboard.test.tsx: does not present Others overspending as a second category overage` | Component | PASS |
| 3 | Existing Others history remains expandable and continues to show its entries and notes. | `Dashboard.test.tsx: shows notes for others expenses` | Component | PASS |
| 4 | All existing calculations, storage compatibility, and unrelated screens remain green. | Full Vitest suite | Regression | PASS |

## Coverage and known gaps

- Whole-project coverage: 84.45% statements, 77.09% branches, 82.94%
  functions, and 88% lines.
- H6 intentionally leaves the `BudgetConfig.others` compatibility alias and
  `bufferRemaining` calculation unchanged; removing that stored field would be
  a separate data-model migration with no user-facing benefit.
- No browser visual check was run in this change. Component tests verify the
  rendered copy and ownership of the overage; CI will verify the production
  bundle.

## Merge evidence

- RED checkpoint: `97bc214 test: reproduce duplicated Others and Buffer money`
- GREEN checkpoint: `3a7ae6b fix: present Others spending through Buffer`

