# Live RLS isolation — TDD evidence

## Source plan

Implementation follows `docs/superpowers/plans/2026-07-14-rls-isolation-tests.md` and the approved design in `docs/superpowers/specs/2026-07-14-rls-isolation-tests-design.md`.

## User journeys

- As a signed-in user, I cannot read or mutate another user's personal financial rows.
- As an app user or anonymous caller, I cannot reach service-only ingestion data or write ingestion status.
- As a non-member, I cannot read or mutate a shared budget, its members, categories, entries, or owner profile.
- As a hostile caller, I cannot use SECURITY DEFINER RPCs to join with a guessed code or rotate another owner's invite code.
- As a maintainer, I get a loud failure when the live stack is unavailable and a dedicated CI result when isolation regresses.

## Task evidence

| Task | Test target | RED evidence | GREEN evidence | Guarantee |
| --- | --- | --- | --- | --- |
| 1 — stack and harness | `schema.rls.test.ts` | The first run failed all 10 tests because Windows could not execute the `npx` shim. After fixing CLI invocation, all 10 reached PostgREST and failed with `42501` because fresh Supabase defaults omitted `service_role` table grants. | `npm run test:rls` passed 10/10 after `20260714110500_grant_service_role_table_access.sql`. With the stack stopped, the same command failed all 10 with `Local Supabase stack is not running`, never skipped. | All nine tables and the profile trigger exist; the oracle is usable on fresh stacks; unavailable infrastructure is loud. |
| 2 — entries | `entries.rls.test.ts` | After mutating `entries_select_own` to `using (true)`, 2/7 tests failed: Bob could read Alice by id and in an unfiltered list. | After `supabase db reset`, `npm run test:rls -- entries` passed 7/7. | Personal entry reads and writes are owner-isolated, with oracle verification of silent no-ops. |
| 3 — poker sessions | `pokerSessions.rls.test.ts` | Characterization test over existing policies; a first-run RED was not expected by the approved plan. | `npm run test:rls -- pokerSessions` passed 6/6. | Poker sessions are owner-isolated for all four verbs and denied to anon. |
| 4 — ingestion | `ingest.rls.test.ts` | Characterization test over existing policies; the supplied plan listed 9 tests but contained 8, so the missing `ingest_status` insert-denial case was added. | `npm run test:rls -- ingest` passed 9/9; `npm test` passed after deleting the SQL string matcher. | Tokens remain service-only; status is owner-readable and client writes are denied. |
| 5 — shared tables | `sharedBudgets.rls.test.ts` | All 10 assertions passed initially; teardown exposed that deleting an auth user cannot cascade through `budgets.owner_id`, so fixture cleanup was corrected to delete the budget first. | `npm run test:rls -- sharedBudgets` passed 10/10. | Non-members cannot observe or mutate the five-table shared-budget surface; owners retain access. |
| 6 — SECURITY DEFINER RPCs | `sharedBudgets.rls.test.ts` | Hostile-caller behavior was previously untested; no policy defect was observed. | The shared-budget target passed 16/16 and the full live suite passed 48/48. | Guessed/anonymous joins and non-owner invite rotation fail; valid joining grants only member visibility. |
| 7 — CI | `.github/workflows/ci.yml` | Not applicable: workflow-only integration. | `npx --yes yaml-lint .github/workflows/ci.yml` reported `YAML Lint successful`; local unit and live suites pass. PR #1 and the post-merge `main` workflow both passed `verify` and `rls`; the post-merge RLS job completed in 3m46s. | CI contains a parallel, always-cleaned-up `rls` job with no repository secrets. |
| 8 — status | coverage + documentation | Not applicable. | `npm run test:coverage` passed 56 files / 477 tests at 84.44% statements, 76.66% branches, 82.94% functions, and 87.99% lines. | Audit status reflects the measured baseline and remaining M17 work. |

## Coverage and known gaps

The live tests intentionally remain outside V8 TypeScript coverage because they exercise Postgres policies. The Docker-free suite passes 477/477 with enforced coverage of 84.44% statements, 76.66% branches, 82.94% functions, and 87.99% lines. Browser E2E and accessibility remain outside this change. The GitHub-hosted `rls` job passed on both PR #1 and the post-merge `main` run.

## Merge evidence

- RED: live schema tests exposed Windows CLI invocation and missing fresh-stack `service_role` grants; the entries policy mutation made the two cross-user read tests fail.
- GREEN: 48/48 live isolation tests and 477/477 Docker-free tests pass locally.
- Refactor/fixture corrections: Vitest 4 serial configuration, `updated_at` for the real ingest schema, `label` for shared categories, and explicit shared-budget teardown.
