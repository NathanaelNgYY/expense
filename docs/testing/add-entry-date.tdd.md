# Direct past-date entry — TDD evidence

**Date:** 2026-07-15

## Source and scope

The journey comes from the open UX-audit item to make backfilling discoverable from the primary Add screen. History had already retired its duplicate form and deep-linked calendar selections into Add, so this change preserves that shortcut and exposes the same date control for normal Add-tab visits.

## User journey

- As a user, I can select a past expense date while entering an expense, without first discovering the History calendar.

## Guarantees

| Guarantee | Evidence | Result |
| --- | --- | --- |
| Add shows a labelled native date control that defaults to the browser-local current date | `src/screens/AddEntry.test.tsx` | PASS |
| A History-selected date remains visible and is saved unchanged | `src/screens/AddEntry.test.tsx` | PASS |
| A past date selected directly in Add changes the action label and persists on the entry | Unit test plus `tests/e2e/journeys.spec.ts` | PASS |
| The browser cannot select a future date through the control | Unit assertion that `max` is the current local date | PASS |
| The native interactive surface measures at least 44px and does not cause horizontal overflow at 375×667 | `tests/e2e/journeys.spec.ts` | PASS |
| Existing mobile journeys and Axe WCAG A/AA scans remain green | `npm run test:e2e` | PASS — 8/8 |

## RED, GREEN, and refactor checkpoints

- RED `3e6840f`: the new tests ran and failed because `Expense date` did not exist on Add.
- GREEN `9ae6a6a`: the native date picker, past-date state, save label, and persistence passed the targeted 13-test unit suite and browser journey.
- Refactor `2bbb2a3`: the 375×667 measurement exposed a 42px native input inside a 44px bordered pill; the shell was increased so the actual interactive input measures 44px.

## Final verification

- `npm run test:coverage`: 56 files, 476 tests; 84.78% statements, 77.16% branches, 83.4% functions, 88.4% lines.
- `npm run lint`: passed.
- `npm run typecheck:functions`: passed.
- `npm run build`: passed.
- `npm run size`: 136.8 KiB initial JavaScript and 12.0 KiB CSS gzip, within the 143/12 KiB budgets.
- `npm run test:e2e`: 8 passed, including Axe, keyboard focus, 44px targets, and the new direct past-date journey.

An earlier attempt to run coverage, lint, and eight Playwright workers concurrently exhausted local worker capacity. Its timeouts were discarded; the commands above were rerun cleanly without contention.

## Known boundaries

- History keeps its useful calendar-day shortcut into Add.
- The app does not allow future expense dates.
- This changes no database schema, sync contract, existing entry, or local-storage key.
