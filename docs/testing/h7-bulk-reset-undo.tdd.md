# H7 bulk month reset undo — TDD evidence

## Source and journeys

Journeys were derived from H7 in the project improvement report:

- As a user resetting the current month, I see how many entries will be deleted before confirming.
- As a user who reset by mistake, I can undo while Settings remains open and recover every entry with its original identity metadata.
- As a user with no entries this month, I am told there is nothing to reset without seeing a destructive confirmation.

## RED and GREEN

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED | `npm test -- src/screens/Settings.test.tsx src/EntriesContext.test.tsx` | Expected failure | 3 failed, 25 passed: counted confirmation, bulk Undo, and tombstone clearing were missing. Commit `b2df61f`. |
| GREEN | `npm test -- src/screens/Settings.test.tsx src/EntriesContext.test.tsx` | PASS | 28 passed after the minimal implementation. Commit `1e9ed4e`. |
| Edge coverage | `npx vitest run src/screens/Settings.test.tsx src/EntriesContext.test.tsx --coverage --coverage.include=src/screens/Settings.tsx --coverage.include=src/EntriesContext.tsx` | PASS | 29 passed; 95.1% statements, 82.55% branches, 93.61% functions, 98.72% lines. |

## Guarantees

| # | What is guaranteed | Test | Type |
| --- | --- | --- | --- |
| 1 | Confirmation states the exact number of current-month entries affected, and other months are untouched. | `Settings.test.tsx: resets only the current month after confirming the number of affected entries` | Component integration |
| 2 | Undo restores every removed entry with its original `id` and `dedupeKey`. | `Settings.test.tsx: undoes a month reset with every original id and dedupe key intact` | Component integration |
| 3 | Restoring an entry clears its deletion tombstone, preventing reconciliation from hiding it. | `EntriesContext.test.tsx: clears the tombstone when restoring an entry and preserves its identity metadata` | Context integration |
| 4 | Declining confirmation makes no changes. | `Settings.test.tsx: keeps the current month when the reset confirmation is declined` | Component integration |
| 5 | An empty current month is a no-op and does not prompt for confirmation. | `Settings.test.tsx: does not ask for confirmation when there are no entries this month` | Component integration |

## Full verification

- `npm test`: 56 files, 477 tests passed.
- `npm run lint`: passed.
- `npm run build`: passed; the existing main-chunk warning remains (560.87 kB minified).
- `npm audit --audit-level=low`: reports the existing 10 dependency findings (1 low, 7 moderate, 2 high); H7 added no dependencies.

## Known boundary

Undo remains available for the lifetime of the mounted Settings screen, as promised in the confirmation copy. Closing Settings discards the in-memory snapshot; entries already restored remain durable through the normal sync queue.
