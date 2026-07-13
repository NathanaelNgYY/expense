# Identity isolation TDD evidence

**Date:** 2026-07-13
**Source:** User-approved work derived from the 2026-07-13 project improvement report; no separate plan file.

## User journeys

- As a person sharing a browser, I must never see or upload another Supabase user's cached financial data.
- As an offline user, my queued mutations must remain attached to the uid that created them.
- As an anonymous user upgrading to Google, I want to retain the same Supabase uid so my ledger and ingest identity remain stable.

## TDD task report

### RED

- Checkpoint: `aab6cbb test: reproduce cross-user identity contamination`
- Command: `npm test -- src/storage.test.ts src/syncQueue.test.ts src/supabaseSync.test.ts src/sharedBudgets/sharedApi.test.ts`
- Result: 5 intended failures, 30 passes.
- Reproduced failures: missing user-scoped storage activation, shared queue visibility, migration of user A's cache into user B, and anonymous Google sign-in using `signInWithOAuth` instead of `linkIdentity`.

### GREEN

- Checkpoint: `c6f0b13 fix: isolate local data by Supabase user`
- Focused command: `npm test -- src/EntriesContext.test.tsx src/storage.test.ts src/syncQueue.test.ts src/supabaseSync.test.ts src/sharedBudgets/sharedApi.test.ts`
- Result: 5 files passed, 52 tests passed.
- Full command before the final cache-swap integration: `npm test`
- Result: 51 files passed, 427 tests passed.
- Final static gates after the cache-swap integration: `npm run lint` and `npm run build`; both passed.

## Test specification

| # | Guarantee | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Legacy cache is copied only to the uid proven by its migration record | `src/storage.test.ts` | unit | PASS |
| 2 | Switching active users swaps to a separate entries namespace | `src/storage.test.ts` | unit | PASS |
| 3 | A user's pending queue is invisible to every other uid | `src/syncQueue.test.ts` | unit | PASS |
| 4 | Account changes do not upload the previous user's cache | `src/supabaseSync.test.ts` | integration | PASS |
| 5 | Anonymous-to-Google upgrade calls `linkIdentity` and preserves the uid | `src/sharedBudgets/sharedApi.test.ts` | unit | PASS |
| 6 | Existing migration, queue, and optimistic-cache behavior remains intact | `src/EntriesContext.test.tsx` | integration | PASS |

## Coverage and known gaps

- `npm test -- --coverage` could not run because the repository does not install `@vitest/coverage-v8`; no coverage percentage is claimed.
- A later final full-suite retry encountered Windows worker starvation in two unrelated UI tests and a Vitest worker-start timeout. A single-worker retry also exceeded four minutes. No product assertion failed in the identity suites; the focused 52-test suite, lint, and production build all passed after the final change.
- Manual identity linking must be enabled in the hosted Supabase project's Auth settings before the Google-linking path is exercised in production.
- The GitHub Actions workflow is committed locally but cannot be pushed until the current GitHub OAuth credential is granted `workflow` scope.

## Merge evidence

- RED checkpoint: `aab6cbb`
- GREEN checkpoint: `c6f0b13`
- If these commits are squashed, preserve the RED/GREEN commands and results from this document in the PR or squash-commit body.
