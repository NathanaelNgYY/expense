# Refund entries — TDD evidence

**Source:** F1 in the user-owned July 19 product audit. The audit itself remains an
untracked user file and was deliberately excluded from task commits.

## User journey

As a user who receives money back for a purchase, I want to record that refund against its
category so Home, History, safe-to-spend, forecasts, and comparisons show net spending without
misclassifying the credit as income.

## Scope and model

- Personal entries have an explicit `expense | refund` kind; legacy entries default to expense.
- Stored amounts remain positive. `entryNetAmount` is the single signed-value boundary used by
  budget calculations (`expense = +amount`, `refund = -amount`).
- Refunds are available for personal entries only. Shared-budget refunds, recurring entries,
  income, and automatic refund-email detection are out of scope.
- Automatic Apple Pay and DBS captures are explicitly written as expenses.
- CSV exports include `kind`; legacy five-column CSV and legacy JSON remain importable as expenses.

## RED → GREEN report

| Stage | Command | Result | Evidence |
| --- | --- | --- | --- |
| RED | `npx vitest run src/shared/entryAmount.test.ts src/compute.test.ts src/screens/AddEntry.test.tsx src/components/SaveToast.test.tsx src/screens/History.test.tsx src/csvEntries.test.ts src/dataTransfer.test.ts src/api.test.ts src/shared/entry.test.ts supabase/functions/ingest/handler.test.ts --reporter=verbose` | Expected failure | 22 contract failures covered missing net math, kind persistence, UI controls, legacy normalization, and ingest defaults. |
| GREEN | Same focused suite with `--reporter=dot` | PASS | 10 files / 180 tests. |
| Full coverage | `npm run test:coverage` | PASS | 73 files / 590 tests; 85.86% statements, 79.08% branches, 85.29% functions, 89.22% lines. |
| Feature coverage | `npx vitest run src/shared/entryAmount.test.ts src/compute.test.ts --coverage --coverage.include=src/shared/entryAmount.ts --coverage.include=src/compute.ts` | PASS | 98.14% statements, 82.02% branches, 96.77% functions, 98.42% lines. |
| Quality | `npm run lint` | PASS | ESLint completed with no findings. |
| App build | `npm run build` | PASS | TypeScript and Vite production build completed; PWA service worker generated. |
| Edge Function types | `npm run typecheck:functions` | PASS | Deno checked ingest and shared rate-limit modules. |
| Bundle gate | `npm run size` | PASS | Initial JS 140.0 KB gzip / 143 KB; CSS 12.8 KB gzip / 13 KB. |
| Local migration | `npx supabase db reset --local --no-seed` | PASS | Clean rebuild applied `20260719100121_add_entry_kind.sql` and all later migrations. |
| RLS | `npm run test:rls` | PASS | 7 files / 58 tests, including refund updates, legacy defaults, invalid-kind rejection, and cross-user isolation. |
| DB advisor | `npx supabase db advisors --local --type security --level warn --fail-on error` | PASS | No security issues found. |
| Browser E2E | `npm run test:e2e` | PASS | 13 mobile Chromium journeys, including refund capture and restored spending room. |

## Test specification

| # | Guarantee | Layer | Result |
| --- | --- | --- | --- |
| 1 | Legacy/missing kind is an expense; refunds produce a negative net contribution. | Domain unit | PASS |
| 2 | Category, weekly, forecast, safe-to-spend, daily, and month-comparison analytics use net spending. | Compute unit | PASS |
| 3 | Add defaults to Expense and persists a positive Refund amount with explicit kind. | UI integration / E2E | PASS |
| 4 | History shows refund credits, nets totals/calendar, and preserves kind through edit and duplicate. | UI integration | PASS |
| 5 | API create/update/bulk paths persist kind; automatic ingest always emits expense. | API / ingest unit | PASS |
| 6 | CSV and JSON round-trip kind while legacy formats default safely to expense. | Import/export unit | PASS |
| 7 | Postgres defaults to expense, constrains allowed kinds, and retains existing per-user RLS. | Local Postgres / RLS | PASS |

## Known gaps

Whole-project branch coverage remains below 80% because of existing code; refund-domain and compute
coverage is above 82% branches. Shared-budget refunds, income, and automatic refund recognition remain
explicit future product decisions rather than silently inferred behavior.

## Commit evidence

- RED checkpoint: `9253b9f test: define refund ledger contracts`
- GREEN checkpoint: `7036626 feat: support refund ledger entries`
- Verification coverage: `76240ae test: complete refund verification coverage`
