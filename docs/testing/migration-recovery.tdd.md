# C4 migration recovery — TDD evidence

## Source

User journeys and acceptance criteria were derived from C4 in the production-readiness audit dated 2026-07-13.

## User journeys

- As a user migrating cached entries, I want a dedupe collision repaired automatically so one bad key cannot trap migration forever.
- As a user whose migration cannot be completed, I want the app to say what failed instead of claiming I am offline.
- As a user with local-only financial data, I want an immediate full-backup action before retrying.
- As a genuinely offline user, I want the existing offline message to remain accurate.

## RED evidence

- `e48e462 test: reproduce unrecoverable migration failures`
  - Command: `npm test -- --run src/supabaseSync.test.ts src/EntriesContext.test.tsx src/components/SyncStatus.test.tsx`
  - Result: 6 intended failures, 34 passes.
  - Proved the old code returned an uncounted `incomplete`, propagated `23505`, classified a migration network failure as `migration`, rendered “You're offline,” and exposed no backup action.
- `8a441f9 test: require immediate migration backup download`
  - Command: `npm test -- --run src/dataTransfer.test.ts`
  - Result: 1 intended failure, 15 passes because the shared backup download helper did not exist.
- `00395e4 test: preserve recovered migration keys across interruption`
  - Command: `npm test -- --run src/supabaseSync.test.ts`
  - Result: 1 intended failure, 11 passes because a repaired key was only persisted after the whole recovery loop.

## GREEN implementation

- `74c2b25 fix: recover entry migration failures safely`
  - Preserves Postgres error code `23505` in `ApiError`.
  - Falls back from a failed batch to per-entry isolation only for a unique violation.
  - Retries the colliding row exactly once with the deterministic key `migration-recovery:<entry-id>`.
  - Persists each repaired key immediately, keeping an interrupted migration resumable.
  - Reports the verified local-only count through `SyncState`.
  - Renders migration-specific copy with Download backup and Retry actions.
  - Reuses the same full JSON backup helper from Data & Backup settings.
  - Keeps genuine network failures classified as offline.

## Test specification

| Guarantee | Test target | Type | Result |
|---|---|---|---|
| A batch `23505` is isolated and only the colliding row receives a stable recovery key | `src/supabaseSync.test.ts` | Unit/integration | PASS |
| A repaired key survives a later network interruption | `src/supabaseSync.test.ts` | Unit/integration | PASS |
| Incomplete verification reports the exact missing count and does not set the completion flag | `src/supabaseSync.test.ts`, `src/EntriesContext.test.tsx` | Integration | PASS |
| A network failure during migration is reported as offline | `src/EntriesContext.test.tsx` | Integration | PASS |
| Migration copy never says “offline” and offers an immediate full backup | `src/components/SyncStatus.test.tsx` | Component | PASS |
| The backup action downloads the complete JSON payload | `src/dataTransfer.test.ts` | Unit/DOM | PASS |
| Supabase/PostgREST error code `23505` survives transport mapping | `src/api.test.ts` | Integration | PASS |

## Verification

- Focused GREEN: 7 files, 100 tests passed.
- Focused coverage for the C4 logic modules:
  - Statements: 90.32%
  - Branches: 80.74%
  - Functions: 91.02%
  - Lines: 96.14%
- Full suite: 54 files, 464 tests passed.
- ESLint: passed with zero warnings.
- TypeScript and Vite production build: passed.

## Known gaps and deployment boundary

- No browser E2E or live Postgres write was run. The recovery behavior is covered at the API mock boundary and this change adds no schema, RLS policy, migration, Edge Function, or remote deployment.
- The deterministic recovery key deliberately preserves both conflicting entries. It changes only the local entry's dedupe identity; the entry id and all financial fields remain unchanged.
