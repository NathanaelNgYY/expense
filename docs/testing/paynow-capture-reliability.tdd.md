# PayNow capture reliability — TDD evidence

## Source

Journeys were derived from the reported delayed PayNow capture, recurring Uncategorized entries,
and the existing iOS DBS-email Shortcut. No source plan was provided.

## User journeys

- As a PayNow user, I want a delayed DBS alert recorded at the bank transaction time so that it
  appears on the correct budget date.
- As a PayNow user, I want flattened or inline DBS email bodies to retain the payee so that merchant
  categorization works like Apple Pay.
- As a user paying a friend, I want the first mobile-recipient transfer placed in Others and later
  corrections reused for that friend.

## RED / GREEN report

- RED: `npm run test:ingest -- --run src/shared/dbsEmail.test.ts supabase/functions/ingest/handler.test.ts`
  executed 31 tests; 8 failed on the intended missing behavior. Payees were empty for flattened and
  inline bodies, parsed transaction time and recipient kind were absent, and mobile transfers had a
  null category. Checkpoint: `473962b`.
- GREEN: the same command executed 31 tests; all 31 passed after the parser and ingest-handler fix.
  Checkpoint: `196b51f`.
- Full verification: `npm run test:coverage` executed 565 tests across 70 files; all passed.
  Coverage was 85.26% statements, 78.05% branches, 84.66% functions, and 88.74% lines.
- Additional gates: `npm run build`, `npm run typecheck:functions`, `npm run lint`, and
  `npm audit --audit-level=high` all exited successfully; the audit found zero vulnerabilities.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | DBS `Date & Time` overrides a receipt timestamp delayed by two days | `handler.test.ts: uses the DBS transaction time` | Integration | PASS |
| 2 | Month-only DBS timestamps infer the prior year across New Year | `dbsEmail.test.ts: infers the previous year` | Unit | PASS |
| 3 | Flattened structured alerts and inline transfer sentences retain their payee | `dbsEmail.test.ts` flattened/inline cases | Unit | PASS |
| 4 | UEN and MOBILE suffixes distinguish business and person recipients | `dbsEmail.test.ts` real PayNow fixtures | Unit | PASS |
| 5 | A recognizable PayNow merchant receives normal keyword categorization | `handler.test.ts: parses a DBS transaction-alert email body` | Integration | PASS |
| 6 | First-time mobile recipients use Others, while correction history wins thereafter | `handler.test.ts` person-to-person cases | Integration | PASS |

## Coverage and known gaps

The repository's configured coverage thresholds pass. Global branch coverage remains 78.05%, below
the generic TDD skill target of 80%; this is a project-wide baseline rather than a skipped PayNow
case. No tests were skipped. A live iPhone/DBS email delivery test remains a deployment-stage manual
check because local tests cannot control when DBS or iOS delivers an email automation.
